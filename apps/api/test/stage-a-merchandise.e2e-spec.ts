import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { CatalogWriteService } from '../src/modules/catalog/application/catalog-write.service';
import { MerchandiseQuoteService } from '../src/modules/catalog/application/merchandise-quote.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import { createApp } from '../src/main';

/**
 * Stage A — Item → Variant → Modifier foundation (docs 103 / 104).
 * Asserts server-authoritative merchandise quotes, variant-specific modifier
 * prices, and cart pricing. Does not touch promotions, tax, fees, or celebrations.
 */
describe('Stage A merchandise foundation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let catalog: CatalogWriteService;
  let quotes: MerchandiseQuoteService;
  let httpApp: INestApplication;

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
        CatalogModule,
        StaffAuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    catalog = app.get(CatalogWriteService);
    quotes = app.get(MerchandiseQuoteService);

    httpApp = await createApp();
    await httpApp.init();
  });

  afterAll(async () => {
    await app.close();
    await httpApp.close();
  });

  async function seedPizza() {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Pune',
    });
    const item = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Pizza',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [
        { size: 'Small', sku: 'PIZ-S', priceMinor: 10000n, isDefault: true },
        { size: 'Large', sku: 'PIZ-L', priceMinor: 16000n },
      ],
      addOnGroups: [
        {
          name: 'Crust',
          minSelect: 1,
          maxSelect: 1,
          addOns: [{ name: 'Thin Crust', priceMinor: 0n, isDefault: true }],
        },
        {
          name: 'Toppings',
          minSelect: 0,
          maxSelect: 2,
          addOns: [
            { name: 'Pepperoni', priceMinor: 100n },
            { name: 'Mushrooms', priceMinor: 150n },
          ],
        },
      ],
    });
    const small = item.variants.find((v) => v.size === 'Small')!;
    const large = item.variants.find((v) => v.size === 'Large')!;
    const toppings = item.addOnGroups.find((g) => g.name === 'Toppings')!;
    const pepperoni = toppings.addOns.find((a) => a.name === 'Pepperoni')!;
    await catalog.setAddOnVariantPrice(staffOf(m.id), pepperoni.id, {
      variantId: small.id,
      priceMinor: 200n,
    });
    await catalog.setAddOnVariantPrice(staffOf(m.id), pepperoni.id, {
      variantId: large.id,
      priceMinor: 300n,
    });
    return { merchantId: m.id, restaurantId: r.id, item, small, large, toppings, pepperoni };
  }

  it('quotes variant-specific pepperoni prices without duplicating the modifier', async () => {
    const seeded = await seedPizza();
    const smallQuote = await quotes.quote({
      variantId: seeded.small.id,
      quantity: 1,
      modifierGroups: [
        { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
      ],
    });
    const largeQuote = await quotes.quote({
      variantId: seeded.large.id,
      quantity: 1,
      modifierGroups: [
        { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
      ],
    });
    expect(smallQuote.unitMerchandiseMinor).toBe(10200n);
    expect(largeQuote.unitMerchandiseMinor).toBe(16300n);
    expect(smallQuote.selections[0].modifierId).toBe(seeded.pepperoni.id);
    expect(largeQuote.selections[0].modifierId).toBe(seeded.pepperoni.id);
    const rows = await prisma.addOnVariantPrice.findMany({ where: { addOnId: seeded.pepperoni.id } });
    expect(rows).toHaveLength(2);
  });

  it('rejects cross-merchant variant-price writes', async () => {
    const a = await seedPizza();
    const other = await provisioning.createMerchant(superAdmin, { legalName: uniq('Other') });
    await expect(
      catalog.setAddOnVariantPrice(staffOf(other.id), a.pepperoni.id, {
        variantId: a.small.id,
        priceMinor: 1n,
      }),
    ).rejects.toThrow(/Cross-merchant|not found|Forbidden|denied/i);
  });

  it('prices the cart from the server quote and ignores client money', async () => {
    const seeded = await seedPizza();
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const http = () => request(httpApp.getHttpServer());
    const created = await http()
      .post('/api/v1/auth/consumer/register')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    expect(created.status).toBe(201);
    const login = await http()
      .post('/api/v1/auth/consumer/login')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    const token = login.body.accessToken as string;

    const rejectedPrice = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: seeded.small.id,
        restaurantId: seeded.restaurantId,
        quantity: 2,
        type: 'DINE_IN',
        unitPriceMinor: 1,
        priceMinor: 1,
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
        ],
      });
    expect(rejectedPrice.status).toBe(400);

    const added = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: seeded.small.id,
        restaurantId: seeded.restaurantId,
        quantity: 2,
        type: 'DINE_IN',
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
        ],
      });
    expect(added.status).toBe(200);
    expect(added.body.subtotalMinor).toBe(String(10200 * 2));
    expect(added.body.items[0].variantPriceMinor).toBe('10000');
    expect(added.body.items[0].modifierTotalMinor).toBe('200');
    expect(added.body.items[0].addOns.schema).toBe('merchandise.v1');

    const flat = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: seeded.small.id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        addOns: [seeded.pepperoni.id],
      });
    expect(flat.status).toBe(400);

    const publicQuote = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.large.id,
        quantity: 1,
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
        ],
      });
    expect(publicQuote.status).toBe(201);
    expect(publicQuote.body.unitMerchandiseMinor).toBe('16300');
  });

  it('does not import or call the promotion evaluation kernel', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../src/modules/ordering/application/cart.service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/PromotionEvaluationService|evaluate\(/);
  });
});

describe('Stage A schema safety', () => {
  const prisma = new (require('@prisma/client').PrismaClient)();
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects negative variant-specific modifier prices and duplicate overrides', async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    const item = await prisma.menuItem.create({
      data: { merchantId: merchant.id, restaurantId: restaurant.id, name: uniq('I') },
    });
    const variant = await prisma.itemVariant.create({
      data: { menuItemId: item.id, priceMinor: 100n, sku: 'SKU-1' },
    });
    const group = await prisma.addOnGroup.create({
      data: { menuItemId: item.id, name: 'Toppings' },
    });
    const addOn = await prisma.addOn.create({
      data: { addOnGroupId: group.id, name: 'Pepperoni', priceMinor: 50n },
    });
    await expect(
      prisma.addOnVariantPrice.create({
        data: { addOnId: addOn.id, variantId: variant.id, priceMinor: -1n },
      }),
    ).rejects.toThrow(/addon_variant_price_nonneg|constraint/i);
    await prisma.addOnVariantPrice.create({
      data: { addOnId: addOn.id, variantId: variant.id, priceMinor: 80n },
    });
    await expect(
      prisma.addOnVariantPrice.create({
        data: { addOnId: addOn.id, variantId: variant.id, priceMinor: 90n },
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });
});
