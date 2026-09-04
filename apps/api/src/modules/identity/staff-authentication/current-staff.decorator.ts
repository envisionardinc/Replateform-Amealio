import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithStaffPrincipal, StaffPrincipal } from './staff-principal';

/** Injects the authenticated StaffPrincipal (set by JwtStaffGuard). */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StaffPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithStaffPrincipal>();
    return req.staffPrincipal;
  },
);
