import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Feature-flag guard: staff/admin auth endpoints are only active when
 * STAFF_AUTH_ENABLED is true (default in local/dev). When disabled the routes
 * behave as if absent (404), preventing accidental exposure of the new auth
 * path. Never wired to production traffic (no cutover in this phase).
 */
@Injectable()
export class StaffAuthEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const enabled = this.config.get<boolean>('STAFF_AUTH_ENABLED');
    if (enabled === false) {
      throw new NotFoundException();
    }
    return true;
  }
}
