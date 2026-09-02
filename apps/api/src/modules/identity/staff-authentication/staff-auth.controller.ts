import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/security/security.decorators';
import { CurrentStaff } from './current-staff.decorator';
import type { StaffPrincipal } from './staff-principal';
import { StaffAuthService } from './staff-auth.service';
import { StaffAuthEnabledGuard } from './guards/staff-auth-enabled.guard';
import { JwtStaffGuard } from './guards/jwt-staff.guard';
import { StaffLoginDto, StaffLogoutDto, StaffRefreshDto } from './dto/staff-auth.dto';

/**
 * Staff/admin authentication endpoints (P1.7.1E) — target platform only.
 * Contract is `Authorization: Bearer <token>` (NOT the legacy raw header).
 * Routes: /api/v1/auth/staff/*  (gated by the STAFF_AUTH_ENABLED flag).
 * No staff registration (accounts are created via a future controlled process).
 */
@Controller({ path: 'auth/staff', version: '1' })
@UseGuards(StaffAuthEnabledGuard)
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: StaffLoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: StaffRefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: StaffLogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @UseGuards(JwtStaffGuard)
  @Get('me')
  me(@CurrentStaff() principal: StaffPrincipal) {
    return this.auth.me(principal.staffMemberId);
  }
}
