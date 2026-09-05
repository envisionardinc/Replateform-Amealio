import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PASSWORD_HASHER, PasswordHasher } from '../domain/ports/password-hasher';
import { StaffAccessTokenService } from './staff-access-token.service';
import { StaffRefreshTokenService } from './staff-refresh-token.service';
import { StaffAuthRecord, StaffMemberRepository, StaffProfile } from './staff-member.repository';
import { StaffLoginDto } from './dto/staff-auth.dto';

export interface StaffAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // access-token lifetime (seconds)
}

/** Public staff view (never includes credential material). */
export interface PublicStaff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  merchantId: string | null;
  staffRole: StaffProfile['staffRole'];
  status: StaffProfile['status'];
}

function toPublic(p: StaffProfile): PublicStaff {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    merchantId: p.merchantId,
    staffRole: p.staffRole,
    status: p.status,
  };
}

/**
 * Staff/admin authentication orchestration (P1.7.1E). Password login only.
 * Uniform failures avoid account enumeration; blocked/deleted staff cannot
 * authenticate or refresh. merchant scope is derived from the StaffMember
 * record (never from request input). No RBAC/permission/act-as logic here.
 */
@Injectable()
export class StaffAuthService {
  constructor(
    private readonly staff: StaffMemberRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly accessTokens: StaffAccessTokenService,
    private readonly refreshTokens: StaffRefreshTokenService,
  ) {}

  async login(dto: StaffLoginDto): Promise<StaffAuthTokens & { staff: PublicStaff }> {
    let record: StaffAuthRecord | null = null;
    if (dto.email) {
      record = await this.staff.findAuthByEmail(dto.email);
    } else if (dto.phone) {
      record = await this.staff.findAuthByPhone(dto.phone);
    }

    // Uniform failure for unknown/ambiguous identifier or bad password
    // (no account-existence disclosure). Deleted staff are excluded by the
    // repository (deletedAt filter) and therefore fail here uniformly too.
    if (!record || !record.secretHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.hasher.verify(dto.password, record.secretHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Account-status enforcement: blocked staff cannot log in.
    if (record.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const tokens = await this.issueTokens({
      id: record.id,
      staffRole: record.staffRole,
      merchantId: record.merchantId,
    });
    const profile = await this.staff.findProfileById(record.id);
    return { ...tokens, staff: toPublic(profile!) };
  }

  async refresh(refreshToken: string): Promise<StaffAuthTokens> {
    const { staffMemberId, refresh } = await this.refreshTokens.rotate(refreshToken);
    // Re-check identity + status so blocked/deleted staff cannot keep refreshing.
    const identity = await this.staff.findIdentityById(staffMemberId);
    if (!identity || identity.deletedAt) {
      // Deleted/absent account: revoke the just-rotated session and fail as unauthenticated.
      await this.refreshTokens.revoke(refresh.token);
      throw new UnauthorizedException('Session revoked or not found');
    }
    if (identity.status !== 'ACTIVE') {
      // Blocked account exists but is disallowed.
      await this.refreshTokens.revoke(refresh.token);
      throw new ForbiddenException('Account is not active');
    }
    const accessToken = await this.accessTokens.issue({
      id: identity.id,
      staffRole: identity.staffRole,
      merchantId: identity.merchantId,
    });
    return {
      accessToken,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.accessTokens.lifetimeSeconds,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(refreshToken);
  }

  async me(staffMemberId: string): Promise<PublicStaff> {
    const profile = await this.staff.findProfileById(staffMemberId);
    if (!profile) throw new UnauthorizedException('Staff account not found');
    return toPublic(profile);
  }

  private async issueTokens(subject: {
    id: string;
    staffRole: StaffAuthRecord['staffRole'];
    merchantId: string | null;
  }): Promise<StaffAuthTokens> {
    const [accessToken, refresh] = await Promise.all([
      this.accessTokens.issue(subject),
      this.refreshTokens.issue(subject.id),
    ]);
    return {
      accessToken,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.accessTokens.lifetimeSeconds,
    };
  }
}
