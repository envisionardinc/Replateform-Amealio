import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Principal, RequestWithPrincipal } from './principal';

/** Injects the current Principal (undefined until an auth layer sets it). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    return req.principal;
  },
);
