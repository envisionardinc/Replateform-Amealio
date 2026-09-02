import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffAuthorizationGuard } from './staff-authorization.guard';
import { StaffPermissionRepository } from './staff-permission.repository';
import type { StaffPrincipal } from '../staff-principal';
import {
  STAFF_MERCHANT_SCOPED_KEY,
  STAFF_PERMISSIONS_KEY,
  STAFF_PLATFORM_ONLY_KEY,
  STAFF_ROLES_KEY,
} from './staff-authorization.decorators';

type Meta = Record<string, unknown>;

function makeReflector(meta: Meta): Reflector {
  return { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
}

function makePerms(keys: string[]): StaffPermissionRepository {
  return { getPermissionKeys: async () => new Set(keys) } as unknown as StaffPermissionRepository;
}

function ctx(
  principal: StaffPrincipal | undefined,
  req: Partial<{ params: Meta; query: Meta; body: Meta }> = {},
): ExecutionContext {
  const request = {
    staffPrincipal: principal,
    params: req.params ?? {},
    query: req.query ?? {},
    body: req.body ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const merchantStaff = (
  merchantId: string,
  role: StaffPrincipal['staffRole'] = 'MERCHANT_STAFF',
): StaffPrincipal => ({
  staffMemberId: 'staff-1',
  actorType: 'STAFF',
  staffRole: role,
  merchantId,
});
const superAdmin: StaffPrincipal = {
  staffMemberId: 'admin-1',
  actorType: 'STAFF',
  staffRole: 'SUPER_ADMIN',
  merchantId: null,
};

describe('StaffAuthorizationGuard', () => {
  it('throws 401 when there is no staff principal', async () => {
    const guard = new StaffAuthorizationGuard(makeReflector({}), makePerms([]));
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows an authenticated staff member when no authorization metadata is set', async () => {
    const guard = new StaffAuthorizationGuard(makeReflector({}), makePerms([]));
    await expect(guard.canActivate(ctx(merchantStaff('m1')))).resolves.toBe(true);
  });

  it('allows when the principal has a required role (ANY)', async () => {
    const guard = new StaffAuthorizationGuard(
      makeReflector({ [STAFF_ROLES_KEY]: ['MERCHANT_OWNER', 'SUPER_ADMIN'] }),
      makePerms([]),
    );
    await expect(guard.canActivate(ctx(merchantStaff('m1', 'MERCHANT_OWNER')))).resolves.toBe(true);
  });

  it('throws 403 when the principal lacks the required role', async () => {
    const guard = new StaffAuthorizationGuard(
      makeReflector({ [STAFF_ROLES_KEY]: ['MERCHANT_OWNER'] }),
      makePerms([]),
    );
    await expect(
      guard.canActivate(ctx(merchantStaff('m1', 'MERCHANT_STAFF'))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when the role grants the required permission', async () => {
    const guard = new StaffAuthorizationGuard(
      makeReflector({ [STAFF_PERMISSIONS_KEY]: ['staff.read'] }),
      makePerms(['staff.read']),
    );
    await expect(guard.canActivate(ctx(merchantStaff('m1')))).resolves.toBe(true);
  });

  it('throws 403 when a required permission is missing', async () => {
    const guard = new StaffAuthorizationGuard(
      makeReflector({ [STAFF_PERMISSIONS_KEY]: ['staff.read'] }),
      makePerms([]),
    );
    await expect(guard.canActivate(ctx(merchantStaff('m1')))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('requires ALL permissions when multiple are specified', async () => {
    const allow = new StaffAuthorizationGuard(
      makeReflector({ [STAFF_PERMISSIONS_KEY]: ['staff.read', 'staff.write'] }),
      makePerms(['staff.read', 'staff.write']),
    );
    await expect(allow.canActivate(ctx(merchantStaff('m1')))).resolves.toBe(true);

    const deny = new StaffAuthorizationGuard(
      makeReflector({ [STAFF_PERMISSIONS_KEY]: ['staff.read', 'staff.write'] }),
      makePerms(['staff.read']),
    );
    await expect(deny.canActivate(ctx(merchantStaff('m1')))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('restricts @PlatformOnly to SUPER_ADMIN', async () => {
    const meta = { [STAFF_PLATFORM_ONLY_KEY]: true };
    const guard = new StaffAuthorizationGuard(makeReflector(meta), makePerms([]));
    await expect(guard.canActivate(ctx(superAdmin))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(merchantStaff('m1')))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('confines merchant staff to their own merchant on @MerchantScoped routes', async () => {
    const meta = { [STAFF_MERCHANT_SCOPED_KEY]: { param: 'merchantId' } };
    const guard = new StaffAuthorizationGuard(makeReflector(meta), makePerms([]));
    // matching merchant id -> allowed
    await expect(
      guard.canActivate(ctx(merchantStaff('m1'), { params: { merchantId: 'm1' } })),
    ).resolves.toBe(true);
    // no supplied id -> effective scope is principal's own -> allowed
    await expect(guard.canActivate(ctx(merchantStaff('m1')))).resolves.toBe(true);
    // different merchant id -> denied
    await expect(
      guard.canActivate(ctx(merchantStaff('m1'), { params: { merchantId: 'm2' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a request-supplied merchant id (query/body) that differs from the principal', async () => {
    const meta = { [STAFF_MERCHANT_SCOPED_KEY]: { param: 'merchantId' } };
    const guard = new StaffAuthorizationGuard(makeReflector(meta), makePerms([]));
    await expect(
      guard.canActivate(ctx(merchantStaff('m1'), { query: { merchantId: 'm2' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(ctx(merchantStaff('m1'), { body: { merchantId: 'm2' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not restrict a platform SUPER_ADMIN on @MerchantScoped routes', async () => {
    const meta = { [STAFF_MERCHANT_SCOPED_KEY]: { param: 'merchantId' } };
    const guard = new StaffAuthorizationGuard(makeReflector(meta), makePerms([]));
    await expect(
      guard.canActivate(ctx(superAdmin, { params: { merchantId: 'm2' } })),
    ).resolves.toBe(true);
  });

  it('SUPER_ADMIN bypasses role and permission gates', async () => {
    const meta = {
      [STAFF_ROLES_KEY]: ['MERCHANT_OWNER'],
      [STAFF_PERMISSIONS_KEY]: ['staff.read', 'staff.write'],
    };
    const guard = new StaffAuthorizationGuard(makeReflector(meta), makePerms([]));
    await expect(guard.canActivate(ctx(superAdmin))).resolves.toBe(true);
  });
});
