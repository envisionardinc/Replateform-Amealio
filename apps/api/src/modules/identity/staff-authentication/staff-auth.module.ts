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
import { StaffPermissionRepository } from './authorization/staff-permission.repository';
import { StaffAuthorizationGuard } from './authorization/staff-authorization.guard';

/**
 * Staff/admin authentication + authorization module (P1.7.1E + P1.7.1F).
 * Depends on IdentityModule for the shared PasswordHasher (bcrypt). Local/dev
 * only; not wired to production. Authorization is the reusable RBAC foundation
 * (guard + decorators + Role/RolePermission enforcement); no act-as / no legacy
 * permission-catalogue migration.
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
    StaffPermissionRepository,
    StaffAuthorizationGuard,
  ],
  exports: [
    StaffAccessTokenService,
    JwtStaffGuard,
    StaffAuthorizationGuard,
    StaffPermissionRepository,
    // Exported so controllers in other modules can compose JwtStaffGuard /
    // StaffAuthorizationGuard (their transitive dependency) without re-providing it.
    StaffMemberRepository,
  ],
})
export class StaffAuthModule {}
