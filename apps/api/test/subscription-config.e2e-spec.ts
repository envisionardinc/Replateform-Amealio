import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { SubscriptionModule } from '../src/modules/subscription/subscription.module';
import { SubscriptionRepository } from '../src/modules/subscription/infrastructure/subscription.repository';
import { SubscriptionService } from '../src/modules/subscription/application/subscription.service';
import { SubscriptionConfigService } from '../src/modules/subscription/application/subscription-config.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.3 Subscription & Configuration foundation — integration against the TEST
 * database. Uses REAL repositories + Prisma against the existing `Subscription`
 * table (config stored as JSON). Controlled synthetic fixtures; no schema change.
 */
describe('Subscription & Configuration foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: SubscriptionRepository;
  let svc: SubscriptionService;
  let cfg: SubscriptionConfigService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const merchantStaff = (merchantId: string): StaffPrincipal => ({
    staffMemberId: 'staff',
    actorType: 'STAFF',
    staffRole: 'MERCHANT_STAFF',
    merchantId,
  });
  const superAdmin: StaffPrincipal = {
    staffMemberId: 'admin',
    actorType: 'STAFF',
    staffRole: 'SUPER_ADMIN',
    merchantId: null,
  };

  let m1 = '';
  let m2 = '';
  let mNoSub = '';

  const sampleConfig = {
    casual_dining: true,
    fast_food_dining: false,
    casual_dining_status: {
      seating: {
        value: true,
        table_management: {
          value: true,
          table_setup: {
            standard: true,
            floors: [{ floor_number: '1', area: 'Main' }],
            table: [{ table_number: 'T1', pax_value: 4, status: 'AVAILABLE' }],
          },
        },
      },
    },
    future_unknown_key: { keep: 'me' },
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
        SubscriptionModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    repo = app.get(SubscriptionRepository);
    svc = app.get(SubscriptionService);
    cfg = app.get(SubscriptionConfigService);

    m1 = (await prisma.merchant.create({ data: { legalName: uniq('M1') } })).id;
    m2 = (await prisma.merchant.create({ data: { legalName: uniq('M2') } })).id;
    mNoSub = (await prisma.merchant.create({ data: { legalName: uniq('Mno') } })).id;

    await prisma.subscription.create({
      data: { merchantId: m1, productType: 'SEATING', status: 'ACTIVE', config: sampleConfig },
    });
    await prisma.subscription.create({
      data: { merchantId: m1, productType: 'ORDERING', status: 'INACTIVE', config: {} },
    });
    await prisma.subscription.create({
      data: {
        merchantId: m2,
        productType: 'SEATING',
        status: 'ACTIVE',
        config: { casual_dining: true },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves subscriptions for a merchant (and active filter)', async () => {
    expect(await repo.findByMerchant(m1)).toHaveLength(2);
    expect(await repo.findActiveByMerchant(m1)).toHaveLength(1);
    expect(await repo.existsForMerchant(m1)).toBe(true);
  });

  it('handles a merchant with no subscription safely', async () => {
    expect(await repo.findByMerchant(mNoSub)).toEqual([]);
    expect(await repo.findActiveByMerchant(mNoSub)).toEqual([]);
    expect(await repo.existsForMerchant(mNoSub)).toBe(false);
  });

  it('reads configuration and interprets confirmed values; preserves unknown keys', async () => {
    const [active] = await repo.findActiveByMerchant(m1);
    expect(active.config).toBeTruthy();
    expect(cfg.getEnabledBusinessTypes(active.config)).toEqual(['casual_dining']);
    expect(cfg.isSeatingEnabled(active.config, 'casual_dining')).toBe(true);
    const ts = cfg.getTableSetup(active.config, 'casual_dining') as Record<string, unknown>;
    expect((ts.table as Array<{ status: string }>)[0].status).toBe('AVAILABLE');
    // unknown key round-trips through the DB JSON column intact
    expect(cfg.getPath(active.config, ['future_unknown_key', 'keep'])).toBe('me');
    // a totally unknown path is undefined, not an error
    expect(cfg.getPath(active.config, ['nope', 'nope'])).toBeUndefined();
  });

  it('scopes subscription access to the staff merchant (P1.7.1F tenancy)', async () => {
    const own = await svc.getForStaff(merchantStaff(m1));
    expect(own.every((s) => s.merchantId === m1)).toBe(true);
    expect(own).toHaveLength(2);
    // matching request id is fine
    expect(await svc.getForStaff(merchantStaff(m1), m1)).toHaveLength(2);
  });

  it('denies cross-merchant subscription access', async () => {
    await expect(svc.getForStaff(merchantStaff(m1), m2)).rejects.toThrow(/cross-merchant/i);
  });

  it('SUPER_ADMIN only via explicit merchant target (platform scope)', async () => {
    expect(await svc.getForStaff(superAdmin)).toEqual([]); // no target
    const targeted = await svc.getForStaff(superAdmin, m2);
    expect(targeted).toHaveLength(1);
    expect(targeted[0].merchantId).toBe(m2);
  });
});
