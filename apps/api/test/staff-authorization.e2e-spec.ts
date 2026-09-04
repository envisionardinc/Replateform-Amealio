import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import { ConsumerAuthModule } from '../src/modules/identity/authentication/consumer-auth.module';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { StaffAccessTokenService } from '../src/modules/identity/staff-authentication/staff-access-token.service';
import { AccessTokenService } from '../src/modules/identity/authentication/access-token.service';
import { JwtStaffGuard } from '../src/modules/identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../src/modules/identity/staff-authentication/authorization/staff-authorization.guard';
import { JwtConsumerGuard } from '../src/modules/identity/authentication/guards/jwt-consumer.guard';
import { CurrentStaff } from '../src/modules/identity/staff-authentication/current-staff.decorator';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import {
  MerchantScoped,
  PlatformOnly,
  RequireStaffPermissions,
  RequireStaffRoles,
} from '../src/modules/identity/staff-authentication/authorization/staff-authorization.decorators';
import { getEffectiveMerchantId } from '../src/modules/identity/staff-authentication/authorization/merchant-scope';

/**
 * P1.7.1F authorization foundation — end-to-end against the TEST database using
 * a dedicated in-test controller that composes the real guards + decorators.
 * Controlled synthetic fixtures only; staff JWTs are minted via the real
 * StaffAccessTokenService (the JwtStaffGuard still re-loads/validates the staff
 * from the DB). No production endpoints are added.
 */
@Controller('t')
class TestAuthzController {
  @Get('whoami')
  @UseGuards(JwtStaffGuard)
  whoami(@CurrentStaff() p: StaffPrincipal) {
    return p;
  }

  @Get('role')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffRoles('MERCHANT_OWNER', 'SUPER_ADMIN')
  role() {
    return { ok: true };
  }

  @Get('perm')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffPermissions('staff.read')
  perm() {
    return { ok: true };
  }

  @Get('multi')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffPermissions('staff.read', 'staff.write')
  multi() {
    return { ok: true };
  }

  @Get('platform')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  platform() {
    return { ok: true };
  }

  @Get('merchant/:merchantId')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @MerchantScoped()
  merchant(@CurrentStaff() p: StaffPrincipal) {
    return { effectiveMerchantId: getEffectiveMerchantId(p) };
  }

  @Get('scoped')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @MerchantScoped()
  scoped(@CurrentStaff() p: StaffPrincipal) {
    return { effectiveMerchantId: getEffectiveMerchantId(p) };
  }

  @Get('nometa')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  nometa() {
    return { ok: true };
  }

  @Get('consumer')
  @UseGuards(JwtConsumerGuard)
  consumer() {
    return { ok: true };
  }
}

describe('Staff/admin authorization foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffTokens: StaffAccessTokenService;
  let consumerTokens: AccessTokenService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // Seeded ids
  let m1 = '';
  let m2 = '';
  let ownerRWToken = ''; // M1 owner, role grants staff.read + staff.write
  let staffReadToken = ''; // M1 staff, role grants staff.read only
  let staffNoPermToken = ''; // M1 staff, no role
  let staffM2Token = ''; // M2 staff, no role
  let adminToken = ''; // SUPER_ADMIN, merchantId null
  let blockedToken = ''; // M1 staff, later BLOCKED
  let deletedToken = ''; // M1 staff, later deleted
  let blockedId = '';
  let deletedId = '';

  async function makeStaff(opts: {
    merchantId: string | null;
    staffRole: StaffPrincipal['staffRole'];
    roleId?: string;
    status?: 'ACTIVE' | 'BLOCKED';
  }) {
    const s = await prisma.staffMember.create({
      data: {
        merchantId: opts.merchantId ?? undefined,
        name: uniq('Staff'),
        email: `${uniq('s')}@example.test`,
        staffRole: opts.staffRole,
        roleId: opts.roleId,
        status: opts.status ?? 'ACTIVE',
      },
    });
    const token = await staffTokens.issue({
      id: s.id,
      staffRole: opts.staffRole,
      merchantId: opts.merchantId,
    });
    return { id: s.id, token };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, StaffAuthModule, ConsumerAuthModule, IdentityModule],
      controllers: [TestAuthzController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    staffTokens = app.get(StaffAccessTokenService);
    consumerTokens = app.get(AccessTokenService);

    const merchant1 = await prisma.merchant.create({ data: { legalName: uniq('M1') } });
    const merchant2 = await prisma.merchant.create({ data: { legalName: uniq('M2') } });
    m1 = merchant1.id;
    m2 = merchant2.id;

    // Role granting staff.read + staff.write (M1)
    const roleRW = await prisma.role.create({
      data: {
        merchantId: m1,
        name: uniq('rw'),
        scope: 'MERCHANT',
        permissions: {
          create: [
            { permissionKey: 'staff.read', allowed: true },
            { permissionKey: 'staff.write', allowed: true },
          ],
        },
      },
    });
    // Role granting staff.read only (M1)
    const roleRead = await prisma.role.create({
      data: {
        merchantId: m1,
        name: uniq('ro'),
        scope: 'MERCHANT',
        permissions: { create: [{ permissionKey: 'staff.read', allowed: true }] },
      },
    });

    ownerRWToken = (
      await makeStaff({ merchantId: m1, staffRole: 'MERCHANT_OWNER', roleId: roleRW.id })
    ).token;
    staffReadToken = (
      await makeStaff({ merchantId: m1, staffRole: 'MERCHANT_STAFF', roleId: roleRead.id })
    ).token;
    staffNoPermToken = (await makeStaff({ merchantId: m1, staffRole: 'MERCHANT_STAFF' })).token;
    staffM2Token = (await makeStaff({ merchantId: m2, staffRole: 'MERCHANT_STAFF' })).token;
    adminToken = (await makeStaff({ merchantId: null, staffRole: 'SUPER_ADMIN' })).token;

    const blocked = await makeStaff({ merchantId: m1, staffRole: 'MERCHANT_STAFF' });
    blockedId = blocked.id;
    blockedToken = blocked.token;
    const deleted = await makeStaff({ merchantId: m1, staffRole: 'MERCHANT_STAFF' });
    deletedId = deleted.id;
    deletedToken = deleted.token;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  // 1
  it('rejects unauthenticated requests with 401', async () => {
    await http().get('/t/whoami').expect(401);
    await http().get('/t/role').expect(401);
    await http().get('/t/perm').expect(401);
  });

  // 10 (composition) + basic auth
  it('authenticates a staff member via JwtStaffGuard (+ authz guard composition)', async () => {
    const res = await http().get('/t/whoami').set(bearer(staffReadToken)).expect(200);
    expect(res.body.actorType).toBe('STAFF');
    expect(res.body.merchantId).toBe(m1);
    await http().get('/t/nometa').set(bearer(staffReadToken)).expect(200); // authn only, no authz meta
  });

  // 2 + 3 (role)
  it('allows an authorized role and 403s an unauthorized role', async () => {
    await http().get('/t/role').set(bearer(ownerRWToken)).expect(200); // MERCHANT_OWNER allowed
    await http().get('/t/role').set(bearer(staffReadToken)).expect(403); // MERCHANT_STAFF denied
  });

  // 2 + 3 (permission) + 8 (no-metadata) + 9 (multiple)
  it('enforces permission requirements (single and multiple)', async () => {
    await http().get('/t/perm').set(bearer(staffReadToken)).expect(200); // has staff.read
    await http().get('/t/perm').set(bearer(staffNoPermToken)).expect(403); // no role/permissions
    await http().get('/t/multi').set(bearer(ownerRWToken)).expect(200); // has read + write
    await http().get('/t/multi').set(bearer(staffReadToken)).expect(403); // missing staff.write
  });

  // 4 (SUPER_ADMIN platform)
  it('grants SUPER_ADMIN platform-only and bypasses role/permission gates', async () => {
    await http().get('/t/platform').set(bearer(adminToken)).expect(200);
    await http().get('/t/platform').set(bearer(ownerRWToken)).expect(403); // merchant staff denied
    await http().get('/t/role').set(bearer(adminToken)).expect(200); // bypass role
    await http().get('/t/multi').set(bearer(adminToken)).expect(200); // bypass permission
  });

  // 5 + 6 + 7 (merchant scope)
  it('confines merchant staff to their own merchant; rejects cross-merchant and request override', async () => {
    // own merchant (route param) -> allowed, effective scope is principal's
    const own = await http().get(`/t/merchant/${m1}`).set(bearer(staffNoPermToken)).expect(200);
    expect(own.body.effectiveMerchantId).toBe(m1);
    // another merchant (route param) -> 403
    await http().get(`/t/merchant/${m2}`).set(bearer(staffNoPermToken)).expect(403);
    // request-supplied merchantId (query) for another merchant -> 403 (cannot override)
    await http().get(`/t/scoped?merchantId=${m2}`).set(bearer(staffNoPermToken)).expect(403);
    // no supplied id -> effective scope defaults to principal's own merchant
    const def = await http().get('/t/scoped').set(bearer(staffNoPermToken)).expect(200);
    expect(def.body.effectiveMerchantId).toBe(m1);
    // staff of M2 cannot reach M1 resources
    await http().get(`/t/merchant/${m1}`).set(bearer(staffM2Token)).expect(403);
    // SUPER_ADMIN is not restricted by merchant scope
    await http().get(`/t/merchant/${m2}`).set(bearer(adminToken)).expect(200);
  });

  // 11 + 12 (cross-actor tokens)
  it('rejects consumer JWT on staff routes and staff JWT on consumer routes', async () => {
    const consumerToken = await consumerTokens.issue('00000000-0000-0000-0000-000000000000');
    await http().get('/t/whoami').set(bearer(consumerToken)).expect(401); // consumer JWT not valid for staff
    await http().get('/t/role').set(bearer(consumerToken)).expect(401);
    await http().get('/t/consumer').set(bearer(ownerRWToken)).expect(401); // staff JWT not valid for consumer
  });

  // 13 + 14 (blocked/deleted remain blocked at the guard)
  it('keeps blocked and deleted staff blocked even with a valid token', async () => {
    await http().get('/t/whoami').set(bearer(blockedToken)).expect(200); // active first
    await prisma.staffMember.update({ where: { id: blockedId }, data: { status: 'BLOCKED' } });
    await http().get('/t/whoami').set(bearer(blockedToken)).expect(401);
    await http().get('/t/perm').set(bearer(blockedToken)).expect(401);

    await prisma.staffMember.update({ where: { id: deletedId }, data: { deletedAt: new Date() } });
    await http().get('/t/whoami').set(bearer(deletedToken)).expect(401);
    await http().get('/t/role').set(bearer(deletedToken)).expect(401);
  });
});
