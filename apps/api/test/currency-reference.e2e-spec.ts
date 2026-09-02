import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ReferenceDataModule } from '../src/modules/reference-data/reference-data.module';
import { CurrencyRepository } from '../src/modules/reference-data/infrastructure/currency.repository';

/**
 * P1.7.6 Currency reference foundation — integration against the TEST database.
 * Platform-global reference data (no merchant tenancy). Verifies canonical ISO
 * identity, legacyId, active/inactive, and that the EXISTING embedded
 * `currencyCode` + exact BigInt minor-unit money are unaffected. No schema
 * change to money models; no FX; no geography.
 */
describe('Currency reference foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let currencies: CurrencyRepository;

  const uniqIso = () => `T${Math.floor(Math.random() * 1e6)}`.slice(0, 6); // synthetic non-standard code
  let inrId = '';
  const inrLegacy = `legacy-inr-${Date.now()}`;
  let inactiveIso = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env', '../../.env'],
        }),
        PrismaModule,
        ReferenceDataModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    currencies = app.get(CurrencyRepository);

    const iso = uniqIso();
    const inr = await prisma.currency.create({
      data: {
        legacyId: inrLegacy,
        isoCode: iso,
        symbol: '\u20B9',
        name: 'Indian Rupee (test)',
        countryName: 'India',
        isActive: true,
      },
    });
    inrId = inr.id;
    (currencies as unknown as { _iso: string })._iso = iso;

    inactiveIso = uniqIso();
    await prisma.currency.create({
      data: { isoCode: inactiveIso, symbol: '$', name: 'Retired (test)', isActive: false },
    });
    // a soft-deleted currency (excluded from active listing)
    await prisma.currency.create({
      data: { isoCode: uniqIso(), name: 'Deleted (test)', deletedAt: new Date() },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves currency identity + preserves symbol/country/name', async () => {
    const c = await currencies.findById(inrId);
    expect(c?.id).toBe(inrId);
    expect(c?.symbol).toBe('\u20B9');
    expect(c?.countryName).toBe('India');
    expect(c?.name).toBe('Indian Rupee (test)');
    expect(c?.isActive).toBe(true);
  });

  it('looks up by legacyId and by ISO code (canonical identity)', async () => {
    const byLegacy = await currencies.findByLegacyId(inrLegacy);
    expect(byLegacy?.id).toBe(inrId);
    const iso = (currencies as unknown as { _iso: string })._iso;
    const byIso = await currencies.findByIsoCode(iso);
    expect(byIso?.id).toBe(inrId);
  });

  it('enforces ISO + legacyId uniqueness', async () => {
    const iso = (currencies as unknown as { _iso: string })._iso;
    await expect(prisma.currency.create({ data: { isoCode: iso } })).rejects.toThrow(
      /unique|constraint/i,
    );
    await expect(
      prisma.currency.create({ data: { isoCode: uniqIso(), legacyId: inrLegacy } }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('active listing excludes inactive and soft-deleted currencies', async () => {
    const active = await currencies.listActive();
    const isoCodes = active.map((c) => c.isoCode);
    expect(isoCodes).toContain((currencies as unknown as { _iso: string })._iso);
    expect(isoCodes).not.toContain(inactiveIso); // isActive=false excluded
    expect(active.some((c) => c.deletedAt !== null)).toBe(false); // soft-deleted excluded
    // listAll includes the inactive one
    expect((await currencies.listAll()).map((c) => c.isoCode)).toContain(inactiveIso);
  });

  it('handles missing / malformed references safely', async () => {
    expect(await currencies.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await currencies.findById('not-a-uuid')).toBeNull();
    expect(await currencies.findByIsoCode('ZZZ')).toBeNull();
    expect(await currencies.findByLegacyId('nope')).toBeNull();
  });

  it('does NOT affect embedded currencyCode + exact BigInt minor-unit money', async () => {
    // The Currency reference table supplements, not replaces, embedded currencyCode.
    const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const m = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const r = await prisma.restaurant.create({ data: { merchantId: m.id, name: uniq('R') } });
    const item = await prisma.menuItem.create({
      data: { merchantId: m.id, restaurantId: r.id, name: uniq('I') },
    });
    const variant = await prisma.itemVariant.create({
      data: { menuItemId: item.id, priceMinor: 123456789n, currencyCode: 'INR' },
    });
    const fetched = await prisma.itemVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(fetched.currencyCode).toBe('INR'); // still an embedded string, no FK
    expect(typeof fetched.priceMinor).toBe('bigint');
    expect(fetched.priceMinor).toBe(123456789n); // exact, no float conversion
  });
});
