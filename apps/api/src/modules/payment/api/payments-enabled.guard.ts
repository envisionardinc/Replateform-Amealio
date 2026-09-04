import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Feature-flag guard (P1.7.28): payment endpoints are only active when
 * PAYMENTS_ENABLED is true (default local/dev). When disabled the routes behave as
 * if absent (404). Never wired to production traffic in this slice (no cutover).
 */
@Injectable()
export class PaymentsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<boolean>('PAYMENTS_ENABLED') === false) {
      throw new NotFoundException();
    }
    return true;
  }
}
