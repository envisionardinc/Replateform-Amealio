import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { MerchantOwnerService } from '../src/modules/onboarding/application/merchant-owner.service';
import { SeatingModule } from '../src/modules/seating/seating.module';
import { SeatingService } from '../src/modules/seating/application/seating.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import { StaffAuthService } from '../src/modules/identity/staff-authentication/staff-auth.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.16 Merchant seating configuration & seating-request foundation —
 * integration (TEST DB). Normalized inventory (SeatingArea/RestaurantTable),
 * physical-table RUNTIME status, and SeatingRequest (WALK_IN/WAITLIST/
 * RESERVATION) over the EXISTING models. Merchant-tenant-scoped; hybrid boundary
 * (config gates stay in Subscription.config).
 */
describe('Seating configuration & request foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let owners: MerchantOwnerService;
  let seating: SeatingService;
  let staffAuth: StaffAuthService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const superAdmin: StaffPrincipal = {
    staffMemberId: '00000000-0000-0000-0000-0000000000aa',
    actorType: 'STAFF',
    staffRole: 'SUPER_ADMIN',
    merchantId: null,
  };
  const staffOf = (merchantId: string): StaffPrincipal => ({
    staffMemberId: '00000000-0000-0000-0000-0000000000bb',
    actorType: 'STAFF',
    staffRole: 'MERCHANT_STAFF',
    merchantId,
  });

  const seedMerchantRestaurant = async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Pune',
    });
    return { merchantId: m.id, restaurantId: r.id };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env', '../../.env'],
        }),
        PrismaModule,
        OnboardingModule,
        SeatingModule,
        StaffAuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    owners = app.get(MerchantOwnerService);
    seating = app.get(SeatingService);
    staffAuth = app.get(StaffAuthService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- INVENTORY: areas + tables ----
  it('creates a seating area and tables within it for the merchant restaurant', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const area = await seating.createSeatingArea(staffOf(merchantId), {
      restaurantId,
      name: 'Rooftop',
      legacyId: uniq('area'),
    });
    expect(area.restaurantId).toBe(restaurantId);
    expect(area.name).toBe('Rooftop');

    const t1 = await seating.createTable(staffOf(merchantId), {
      seatingAreaId: area.id,
      code: 'T1',
      name: 'Window',
      floor: 'Ground',
      shape: 'Circle',
      capacity: 4,
    });
    expect(t1.code).toBe('T1');
    expect(t1.capacity).toBe(4);
    expect(t1.isActive).toBe(true);
    expect(t1.status).toBe('AVAILABLE'); // runtime default

    const tables = await seating.listTables(staffOf(merchantId), restaurantId);
    expect(tables).toHaveLength(1);
    const persisted = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: t1.id } });
    expect(persisted.status).toBe('AVAILABLE');
  });

  it('enforces area name uniqueness and table code uniqueness per area', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    await seating.createSeatingArea(staffOf(merchantId), { restaurantId, name: 'Patio' });
    await expect(
      seating.createSeatingArea(staffOf(merchantId), { restaurantId, name: 'Patio' }),
    ).rejects.toThrow(/unique|constraint/i);

    const area = await seating.createSeatingArea(staffOf(merchantId), {
      restaurantId,
      name: 'Hall',
    });
    await seating.createTable(staffOf(merchantId), { seatingAreaId: area.id, code: 'A1' });
    await expect(
      seating.createTable(staffOf(merchantId), { seatingAreaId: area.id, code: 'A1' }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('rejects invalid inputs (empty name, bad capacity, unknown area)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    await expect(
      seating.createSeatingArea(staffOf(merchantId), { restaurantId, name: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const area = await seating.createSeatingArea(staffOf(merchantId), { restaurantId, name: 'X' });
    await expect(
      seating.createTable(staffOf(merchantId), { seatingAreaId: area.id, code: 'T', capacity: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      seating.createTable(staffOf(merchantId), {
        seatingAreaId: '00000000-0000-0000-0000-000000000000',
        code: 'T',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---- TENANCY ----
  it('rejects cross-merchant inventory writes and honors SUPER_ADMIN explicit target', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    // staff of B cannot create an area in A's restaurant
    await expect(
      seating.createSeatingArea(staffOf(b.merchantId), { restaurantId: a.restaurantId, name: 'Z' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // SUPER_ADMIN may target any restaurant explicitly
    const area = await seating.createSeatingArea(superAdmin, {
      restaurantId: a.restaurantId,
      name: 'Admin Area',
    });
    expect(area.restaurantId).toBe(a.restaurantId);
    // unknown restaurant -> NotFound
    await expect(
      seating.createSeatingArea(superAdmin, {
        restaurantId: '00000000-0000-0000-0000-000000000000',
        name: 'Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects writes against a soft-deleted restaurant', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { deletedAt: new Date() },
    });
    await expect(
      seating.createSeatingArea(staffOf(merchantId), { restaurantId, name: 'Z' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activation gate: a BLOCKED merchant owner cannot obtain a session to operate', async () => {
    const { merchantId } = await seedMerchantRestaurant();
    const email = `${uniq('owner')}@ex.test`;
    const password = 'S3cretPass!';
    await owners.provisionOwner(superAdmin, { merchantId, name: 'Owner', email, password });
    // pending (BLOCKED) owner cannot log in -> cannot get a StaffPrincipal to call seating
    await expect(staffAuth.login({ email, password })).rejects.toBeInstanceOf(ForbiddenException);
    await owners.activateMerchant(superAdmin, merchantId);
    const session = await staffAuth.login({ email, password });
    expect(session.staff.merchantId).toBe(merchantId);
  });

  // ---- TABLE RUNTIME STATUS ----
  it('sets physical table runtime status (merchant-scoped) and rejects invalid/cross-merchant', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const area = await seating.createSeatingArea(staffOf(a.merchantId), {
      restaurantId: a.restaurantId,
      name: 'Main',
    });
    const table = await seating.createTable(staffOf(a.merchantId), {
      seatingAreaId: area.id,
      code: 'T1',
    });
    const updated = await seating.setTableStatus(staffOf(a.merchantId), table.id, 'OCCUPIED');
    expect(updated.status).toBe('OCCUPIED');
    await expect(
      seating.setTableStatus(staffOf(a.merchantId), table.id, 'BUSY' as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    // cross-merchant cannot change A's table
    await expect(
      seating.setTableStatus(staffOf(b.merchantId), table.id, 'AVAILABLE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ---- SEATING REQUESTS: reservation / walk-in / waitlist ----
  it('creates RESERVATION, WALK_IN and WAITLIST requests with the distinctions preserved', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);

    const reservation = await seating.createSeatingRequest(staff, {
      restaurantId,
      type: 'RESERVATION',
      partySize: 4,
      reservationAt: new Date(Date.now() + 3600_000).toISOString(),
      kidsCount: 1,
      highChairs: 1,
    });
    expect(reservation.type).toBe('RESERVATION');
    expect(reservation.status).toBe('PENDING');
    expect(reservation.reservationAt).toBeInstanceOf(Date);
    expect(reservation.tableId).toBeNull(); // capacity/restaurant-level at creation

    const walkIn = await seating.createSeatingRequest(staff, {
      restaurantId,
      type: 'WALK_IN',
      partySize: 2,
    });
    expect(walkIn.type).toBe('WALK_IN');
    const waitlist = await seating.createSeatingRequest(staff, {
      restaurantId,
      type: 'WAITLIST',
      partySize: 3,
    });
    expect(waitlist.type).toBe('WAITLIST');
    // distinct persisted rows/types
    expect(new Set([reservation.type, walkIn.type, waitlist.type]).size).toBe(3);
  });

  it('requires reservationAt for RESERVATION and validates type/partySize', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    await expect(
      seating.createSeatingRequest(staff, { restaurantId, type: 'RESERVATION', partySize: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      seating.createSeatingRequest(staff, { restaurantId, type: 'NOPE' as never, partySize: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      seating.createSeatingRequest(staff, { restaurantId, type: 'WALK_IN', partySize: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('binds a physical table at accept/seat and keeps table binding within the restaurant', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const staff = staffOf(a.merchantId);
    const area = await seating.createSeatingArea(staff, {
      restaurantId: a.restaurantId,
      name: 'Main',
    });
    const table = await seating.createTable(staff, { seatingAreaId: area.id, code: 'T1' });
    const req = await seating.createSeatingRequest(staff, {
      restaurantId: a.restaurantId,
      type: 'WALK_IN',
      partySize: 2,
    });

    const seated = await seating.updateSeatingRequest(staff, req.id, {
      status: 'SEATED',
      tableId: table.id,
    });
    expect(seated.status).toBe('SEATED');
    expect(seated.tableId).toBe(table.id);

    // a table from another restaurant cannot be bound
    const bArea = await seating.createSeatingArea(staffOf(b.merchantId), {
      restaurantId: b.restaurantId,
      name: 'Main',
    });
    const bTable = await seating.createTable(staffOf(b.merchantId), {
      seatingAreaId: bArea.id,
      code: 'T1',
    });
    await expect(
      seating.updateSeatingRequest(staff, req.id, { tableId: bTable.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces request ownership (cross-merchant update rejected) and unknown request', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const req = await seating.createSeatingRequest(staffOf(a.merchantId), {
      restaurantId: a.restaurantId,
      type: 'WAITLIST',
      partySize: 2,
    });
    await expect(
      seating.updateSeatingRequest(staffOf(b.merchantId), req.id, { status: 'CANCELLED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      seating.updateSeatingRequest(superAdmin, '00000000-0000-0000-0000-000000000000', {
        status: 'CANCELLED',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---- SUBSCRIPTION CONFIG BOUNDARY (non-destructive; reuses P1.7.14) ----
  it('seating config gates live in Subscription.config and merge non-destructively (unchanged by seating inventory)', async () => {
    const { merchantId } = await seedMerchantRestaurant();
    const sub = await provisioning.createSubscription(staffOf(merchantId), {
      merchantId,
      productType: 'SEATING',
      config: {
        casual_dining_status: {
          seating: { value: true, reservation: { value: true, table_kept_for: 15 } },
        },
      },
    });
    const res = await owners.updateSubscriptionConfig(staffOf(merchantId), sub.id, {
      config: { casual_dining_status: { seating: { walkin_waitlist: { value: true } } } },
    });
    const cfg = res.config as Record<string, any>;
    // unrelated gate preserved
    expect(cfg.casual_dining_status.seating.value).toBe(true);
    expect(cfg.casual_dining_status.seating.reservation.table_kept_for).toBe(15);
    // new gate merged
    expect(cfg.casual_dining_status.seating.walkin_waitlist.value).toBe(true);
  });
});
