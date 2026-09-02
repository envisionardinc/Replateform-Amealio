import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityModule } from '../identity.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffAccessTokenService } from './staff-access-token.service';
import { StaffRefreshTokenService } from './staff-refresh-token.service';
import { StaffMemberRepository } from './staff-member.repository';
import { StaffSessionRepository } from './staff-session.repository';
import { JwtStaffGuard } from './guards/jwt-staff.guard';
import { StaffAuthEnabledGuard } from './guards/staff-auth-enabled.guard';

/**
 * Staff/admin authentication module (P1.7.1E). Depends on IdentityModule for
 * the shared PasswordHasher (bcrypt). Local/dev only; not wired to production.
 * No RBAC/permission enforcement, no act-as, no data migration.
 */
@Module({
  imports: [IdentityModule, JwtModule.register({})],
  controllers: [StaffAuthController],
  providers: [
    StaffAuthService,
    StaffAccessTokenService,
    StaffRefreshTokenService,
    StaffMemberRepository,
    StaffSessionRepository,
    JwtStaffGuard,
    StaffAuthEnabledGuard,
  ],
  exports: [StaffAccessTokenService, JwtStaffGuard],
})
export class StaffAuthModule {}
