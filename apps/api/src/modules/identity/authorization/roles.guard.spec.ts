import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import {
  IS_PUBLIC_KEY,
  REQUIRE_MERCHANT_SCOPE_KEY,
  ROLES_KEY,
} from '../../../common/security/security.decorators';
import type { Principal } from './principal';

function context(principal?: Principal): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function reflectorWith(meta: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows public routes without a principal', () => {
    const guard = new RolesGuard(reflectorWith({ [IS_PUBLIC_KEY]: true }));
    expect(guard.canActivate(context())).toBe(true);
  });

  it('rejects a protected route with no principal (401)', () => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('allows an authenticated principal when no roles are required', () => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(guard.canActivate(context({ userId: 'u1', roles: ['CUSTOMER'] }))).toBe(true);
  });

  it('allows when the principal has a required role', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: ['SUPER_ADMIN'] }));
    expect(guard.canActivate(context({ userId: 'a1', roles: ['SUPER_ADMIN'] }))).toBe(true);
  });

  it('forbids when the principal lacks a required role (403)', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: ['SUPER_ADMIN'] }));
    expect(() => guard.canActivate(context({ userId: 'u1', roles: ['CUSTOMER'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids when merchant scope is required but absent (403)', () => {
    const guard = new RolesGuard(reflectorWith({ [REQUIRE_MERCHANT_SCOPE_KEY]: true }));
    expect(() => guard.canActivate(context({ userId: 'm1', roles: ['MERCHANT_OWNER'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows when merchant scope is present', () => {
    const guard = new RolesGuard(reflectorWith({ [REQUIRE_MERCHANT_SCOPE_KEY]: true }));
    expect(
      guard.canActivate(context({ userId: 'm1', roles: ['MERCHANT_OWNER'], merchantId: 'M1' })),
    ).toBe(true);
  });
});
