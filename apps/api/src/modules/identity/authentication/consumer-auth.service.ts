import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PASSWORD_HASHER, PasswordHasher } from '../domain/ports/password-hasher';
import { AuthUserRecord, USER_REPOSITORY, UserRepository } from '../domain/ports/user.repository';
import { RegisterUserUseCase } from '../application/register-user.use-case';
import { GetUserUseCase } from '../application/get-user.use-case';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { LoginConsumerDto, RegisterConsumerDto } from './dto/auth.dto';
import { UserSnapshot } from '../domain/user.entity';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // access-token lifetime (seconds)
}

/** Public user view (never includes credential material). */
function publicUser(snap: UserSnapshot) {
  return {
    id: snap.id,
    phoneCountryCode: snap.phoneCountryCode,
    phone: snap.phone,
    email: snap.email,
    isVerified: snap.isVerified,
  };
}

@Injectable()
export class ConsumerAuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly registerUser: RegisterUserUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async register(dto: RegisterConsumerDto) {
    const user = await this.registerUser.execute({
      phoneCountryCode: dto.phoneCountryCode,
      phone: dto.phone,
      email: dto.email,
      password: dto.password, // hashed by the use-case
    });
    return publicUser(user.toSnapshot());
  }

  async login(
    dto: LoginConsumerDto,
  ): Promise<AuthTokens & { user: ReturnType<typeof publicUser> }> {
    let record: AuthUserRecord | null = null;
    if (dto.email) {
      record = await this.users.findAuthByEmail(dto.email.trim().toLowerCase());
    } else if (dto.phoneCountryCode && dto.phone) {
      const cc = dto.phoneCountryCode.startsWith('+')
        ? dto.phoneCountryCode
        : `+${dto.phoneCountryCode}`;
      record = await this.users.findAuthByPhone(cc, dto.phone);
    }

    // Uniform failure for unknown account or bad password (no user enumeration).
    if (!record || !record.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.hasher.verify(dto.password, record.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Account-status enforcement (evidence-backed): blocked accounts cannot log in.
    if (record.isBlocked) {
      throw new ForbiddenException('Account is blocked');
    }

    const tokens = await this.issueTokens(record.id);
    const user = await this.getUser.byId(record.id);
    return { ...tokens, user: publicUser(user.toSnapshot()) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { userId, refresh } = await this.refreshTokens.rotate(refreshToken);
    // Re-check status on refresh so a blocked account cannot keep refreshing.
    const user = await this.users.findById(userId);
    if (!user || user.isBlocked) {
      await this.refreshTokens.revoke(refresh.token);
      throw new ForbiddenException('Account is blocked');
    }
    const accessToken = await this.accessTokens.issue(userId);
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

  async me(userId: string) {
    const user = await this.getUser.byId(userId);
    return publicUser(user.toSnapshot());
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const [accessToken, refresh] = await Promise.all([
      this.accessTokens.issue(userId),
      this.refreshTokens.issue(userId),
    ]);
    return {
      accessToken,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.accessTokens.lifetimeSeconds,
    };
  }
}
