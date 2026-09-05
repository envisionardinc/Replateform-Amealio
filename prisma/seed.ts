/**
 * Minimal, clearly-synthetic development seed data (P1.5).
 * NOT production data. No financial history is created.
 * Idempotent: safe to run repeatedly (keyed on stable synthetic identifiers).
 *
 * Provides enough data to develop/test: users, roles, restaurant, location,
 * menu, menu item.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // --- Merchant (tenant) ---
  const merchant = await prisma.merchant.upsert({
    where: { legacyId: 'seed-merchant-1' },
    update: {},
    create: {
      legacyId: 'seed-merchant-1',
      legalName: 'DEV Synthetic Foods Pvt Ltd',
      email: 'dev.merchant@example.test',
      phone: '+910000000001',
    },
  });

  // --- Role + permissions ---
  const role = await prisma.role.upsert({
    where: { merchantId_name: { merchantId: merchant.id, name: 'Owner' } },
    update: {},
    create: {
      merchantId: merchant.id,
      name: 'Owner',
      scope: 'MERCHANT',
      isDefault: true,
      permissions: {
        create: [
          { permissionKey: 'orders.manage', allowed: true },
          { permissionKey: 'menu.manage', allowed: true },
          { permissionKey: 'settlements.view', allowed: true },
        ],
      },
    },
  });

  // --- Staff ---
  const staffId = await stableId('staff-owner', merchant.id);
  await prisma.staffMember.upsert({
    where: { id: staffId },
    update: {},
    create: {
      id: staffId,
      merchantId: merchant.id,
      name: 'DEV Owner',
      email: 'dev.owner@example.test',
      staffRole: 'MERCHANT_OWNER',
      roleId: role.id,
    },
  });
  const staffSecret = await bcrypt.hash('MerchantSecret123!', 10);
  const adminId = await stableId('staff-super-admin', 'platform');
  await prisma.staffMember.upsert({
    where: { id: adminId },
    update: { email: 'dev.admin@example.test', staffRole: 'SUPER_ADMIN', merchantId: null },
    create: {
      id: adminId,
      merchantId: null,
      name: 'DEV Super Admin',
      email: 'dev.admin@example.test',
      staffRole: 'SUPER_ADMIN',
    },
  });
  await prisma.staffCredential.upsert({
    where: { staffMemberId_type: { staffMemberId: adminId, type: 'PASSWORD' } },
    update: { secretHash: staffSecret },
    create: { staffMemberId: adminId, type: 'PASSWORD', secretHash: staffSecret },
  });
  await prisma.staffCredential.upsert({
    where: { staffMemberId_type: { staffMemberId: staffId, type: 'PASSWORD' } },
    update: { secretHash: staffSecret },
    create: { staffMemberId: staffId, type: 'PASSWORD', secretHash: staffSecret },
  });
  const riderId = rfcUuid(await stableId('rider-1', merchant.id));
  const staleRiders = await prisma.deliveryPerson.findMany({
    where: {
      merchantId: merchant.id,
      name: 'DEV Rider',
      id: { not: riderId },
    },
  });
  if (staleRiders.length) {
    await prisma.order.updateMany({
      where: { deliveryPersonId: { in: staleRiders.map((r) => r.id) } },
      data: { deliveryPersonId: null },
    });
    await prisma.deliveryPerson.deleteMany({
      where: { id: { in: staleRiders.map((r) => r.id) } },
    });
  }
  await prisma.deliveryPerson.upsert({
    where: { id: riderId },
    update: { isOnline: true, merchantId: merchant.id, name: 'DEV Rider' },
    create: {
      id: riderId,
      merchantId: merchant.id,
      name: 'DEV Rider',
      phone: '+910000000099',
      isOnline: true,
    },
  });

  // --- Restaurant (location) ---
  const restaurant = await prisma.restaurant.upsert({
    where: { legacyId: 'seed-restaurant-1' },
    update: {},
    create: {
      legacyId: 'seed-restaurant-1',
      merchantId: merchant.id,
      name: 'DEV Test Kitchen',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560001',
      country: 'IN',
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      lat: 12.9716,
      lon: 77.5946,
      operatingHours: {
        create: [
          { dayOfWeek: 1, openTime: '10:00', closeTime: '22:00' },
          { dayOfWeek: 2, openTime: '10:00', closeTime: '22:00' },
        ],
      },
      seatingAreas: {
        create: [{ name: 'Main Hall', tables: { create: [{ code: 'T1', capacity: 4 }] } }],
      },
    },
  });

  // --- Catalog taxonomy ---
  const category = await prisma.category.upsert({
    where: { code: 'MAINS' },
    update: {},
    create: { name: 'Mains', code: 'MAINS', type: 'FOOD' },
  });
  await prisma.category.upsert({
    where: { code: 'DESSERTS' },
    update: {},
    create: { name: 'Desserts', code: 'DESSERTS', type: 'FOOD' },
  });
  const breads = await prisma.category.upsert({
    where: { code: 'BREADS' },
    update: {},
    create: {
      name: 'Breads with a deliberately long label for chip overflow',
      code: 'BREADS',
      type: 'FOOD',
    },
  });
  await prisma.cuisine.upsert({
    where: { name: 'North Indian' },
    update: {},
    create: { name: 'North Indian' },
  });
  const uom = await prisma.unitOfMeasure.upsert({
    where: { code: 'PLATE' },
    update: {},
    create: { code: 'PLATE', name: 'Plate' },
  });

  // --- Menu / section / item / variant ---
  const menu = await prisma.menu.upsert({
    where: { legacyId: 'seed-menu-1' },
    update: {},
    create: {
      legacyId: 'seed-menu-1',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      name: 'DEV Standard Menu',
      type: 'STANDARD',
    },
  });
  const section = await prisma.menuSection.upsert({
    where: { id: await stableId('section-mains', menu.id) },
    update: {},
    create: {
      id: await stableId('section-mains', menu.id),
      menuId: menu.id,
      categoryId: category.id,
      name: 'Mains',
      sortOrder: 1,
    },
  });
  const item = await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-1' },
    update: { isPublished: true, availability: 'AVAILABLE' },
    create: {
      legacyId: 'seed-item-1',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      menuSectionId: section.id,
      name: 'DEV Paneer Butter Masala',
      description: 'Synthetic dev item',
      availability: 'AVAILABLE',
      isPublished: true,
    },
  });
  // Cart/checkout DTOs require RFC UUID variant ids. The old sha1-as-UUID
  // helper produced invalid variant nibbles that @IsUUID() rejects.
  await prisma.itemVariant.deleteMany({ where: { menuItemId: item.id } });
  await prisma.itemVariant.create({
    data: {
      menuItemId: item.id,
      size: 'Regular',
      sku: 'DEV-PBM-REG',
      uomId: uom.id,
      priceMinor: 24900n, // ₹249.00 in paise
      currencyCode: 'INR',
      available: true,
    },
  });
  await prisma.addOnGroup.deleteMany({ where: { menuItemId: item.id } });
  await prisma.addOnGroup.create({
    data: {
      menuItemId: item.id,
      name: 'Spice',
      minSelect: 1,
      maxSelect: 1,
      available: true,
      addOns: {
        create: [
          { name: 'Mild', priceMinor: 0n, isDefault: true, sortOrder: 1 },
          { name: 'Hot', priceMinor: 1000n, sortOrder: 2 },
        ],
      },
    },
  });

  // --- Consumer user + profile + address ---
  const user = await prisma.user.upsert({
    where: { phoneCountryCode_phone: { phoneCountryCode: '+91', phone: '9000000000' } },
    update: {},
    create: {
      legacyId: 'seed-user-1',
      phoneCountryCode: '+91',
      phone: '9000000000',
      email: 'dev.user@example.test',
      isVerified: true,
      profile: { create: { preferences: { veg: true } } },
      addresses: {
        create: [
          { line1: 'DEV 1 Test Street', city: 'Bengaluru', pinCode: '560001', isDefault: true },
        ],
      },
    },
  });

  // --- Notification template ---
  await prisma.notificationTemplate.upsert({
    where: { key: 'ORDER_CONFIRMED' },
    update: {},
    create: { key: 'ORDER_CONFIRMED', channel: 'PUSH', body: 'Your order is confirmed.' },
  });

  await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-soldout' },
    update: { isPublished: true, availability: 'SOLDOUT' },
    create: {
      legacyId: 'seed-item-soldout',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      name: 'DEV Sold-Out Biryani',
      description: 'Published but unavailable',
      availability: 'SOLDOUT',
      isPublished: true,
    },
  });
  const sold = await prisma.menuItem.findUniqueOrThrow({
    where: { legacyId: 'seed-item-soldout' },
  });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: sold.id } });
  await prisma.itemVariant.create({
    data: {
      menuItemId: sold.id,
      size: 'Regular',
      priceMinor: 19900n,
      currencyCode: 'INR',
      available: false,
    },
  });

  const breadMerchant = await prisma.merchant.upsert({
    where: { legacyId: 'seed-merchant-bread' },
    update: {},
    create: { legacyId: 'seed-merchant-bread', legalName: 'DEV Bread Foods' },
  });
  const breadRestaurant = await prisma.restaurant.upsert({
    where: { legacyId: 'seed-restaurant-bread' },
    update: { status: 'ACTIVE' },
    create: {
      legacyId: 'seed-restaurant-bread',
      merchantId: breadMerchant.id,
      name: 'DEV Bread Kitchen',
      city: 'Bengaluru',
      status: 'ACTIVE',
    },
  });
  const breadMenu = await prisma.menu.upsert({
    where: { legacyId: 'seed-menu-bread' },
    update: {},
    create: {
      legacyId: 'seed-menu-bread',
      merchantId: breadMerchant.id,
      restaurantId: breadRestaurant.id,
      name: 'DEV Bread Menu',
      type: 'STANDARD',
    },
  });
  const breadSection = await prisma.menuSection.upsert({
    where: { id: await stableId('section-breads', breadMenu.id) },
    update: { categoryId: breads.id },
    create: {
      id: await stableId('section-breads', breadMenu.id),
      menuId: breadMenu.id,
      categoryId: breads.id,
      name: 'Breads',
      sortOrder: 1,
    },
  });
  const breadItem = await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-bread' },
    update: { isPublished: true, availability: 'AVAILABLE', menuSectionId: breadSection.id },
    create: {
      legacyId: 'seed-item-bread',
      merchantId: breadMerchant.id,
      restaurantId: breadRestaurant.id,
      menuSectionId: breadSection.id,
      name: 'DEV Butter Naan',
      description: 'Synthetic bread item',
      availability: 'AVAILABLE',
      isPublished: true,
    },
  });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: breadItem.id } });
  await prisma.itemVariant.create({
    data: {
      menuItemId: breadItem.id,
      size: 'Regular',
      uomId: uom.id,
      priceMinor: 4900n,
      currencyCode: 'INR',
      available: true,
    },
  });

  const customMenu = await prisma.menu.upsert({
    where: { legacyId: 'seed-menu-custom-1' },
    update: { type: 'CUSTOM', visibility: true, name: 'DEV Chef Specials' },
    create: {
      legacyId: 'seed-menu-custom-1',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      name: 'DEV Chef Specials',
      type: 'CUSTOM',
      visibility: true,
    },
  });
  const customSection = await prisma.menuSection.upsert({
    where: { id: await stableId('section-specials', customMenu.id) },
    update: { name: 'Specials' },
    create: {
      id: await stableId('section-specials', customMenu.id),
      menuId: customMenu.id,
      name: 'Specials',
      sortOrder: 1,
    },
  });
  const tasting = await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-tasting' },
    update: {
      isPublished: true,
      availability: 'AVAILABLE',
      menuSectionId: customSection.id,
    },
    create: {
      legacyId: 'seed-item-tasting',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      menuSectionId: customSection.id,
      name: 'DEV Tasting Plate',
      description: 'Custom menu catalog item',
      availability: 'AVAILABLE',
      isPublished: true,
    },
  });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: tasting.id } });
  await prisma.itemVariant.create({
    data: {
      menuItemId: tasting.id,
      size: 'Regular',
      sku: 'DEV-TASTE-REG',
      priceMinor: 39900n,
      currencyCode: 'INR',
      available: true,
    },
  });
  await prisma.addOnGroup.deleteMany({ where: { menuItemId: tasting.id } });
  await prisma.addOnGroup.create({
    data: {
      menuItemId: tasting.id,
      name: 'Dip',
      minSelect: 1,
      maxSelect: 1,
      available: true,
      addOns: {
        create: [
          { name: 'Mint', priceMinor: 0n, isDefault: true, sortOrder: 1 },
          { name: 'Tamarind', priceMinor: 1500n, sortOrder: 2 },
        ],
      },
    },
  });

  const pizza = await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-pizza-avail' },
    update: {
      isPublished: true,
      availability: 'AVAILABLE',
      menuSectionId: customSection.id,
      name: 'DEV Availability Pizza',
      description: 'Small available, Large unavailable; Mushrooms unavailable',
    },
    create: {
      legacyId: 'seed-item-pizza-avail',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      menuSectionId: customSection.id,
      name: 'DEV Availability Pizza',
      description: 'Small available, Large unavailable; Mushrooms unavailable',
      availability: 'AVAILABLE',
      isPublished: true,
    },
  });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: pizza.id } });
  await prisma.itemVariant.createMany({
    data: [
      {
        menuItemId: pizza.id,
        size: 'Small',
        sku: 'DEV-PIZ-S',
        priceMinor: 19900n,
        currencyCode: 'INR',
        isDefault: true,
        available: true,
      },
      {
        menuItemId: pizza.id,
        size: 'Large',
        sku: 'DEV-PIZ-L',
        priceMinor: 29900n,
        currencyCode: 'INR',
        available: false,
      },
    ],
  });
  await prisma.addOnGroup.deleteMany({ where: { menuItemId: pizza.id } });
  await prisma.addOnGroup.create({
    data: {
      menuItemId: pizza.id,
      name: 'Crust',
      minSelect: 1,
      maxSelect: 1,
      available: true,
      addOns: {
        create: [{ name: 'Thin Crust', priceMinor: 0n, isDefault: true, sortOrder: 1 }],
      },
    },
  });
  await prisma.addOnGroup.create({
    data: {
      menuItemId: pizza.id,
      name: 'Toppings',
      minSelect: 0,
      maxSelect: 2,
      available: true,
      addOns: {
        create: [
          { name: 'Pepperoni', priceMinor: 2000n, sortOrder: 1 },
          { name: 'Mushrooms', priceMinor: 1500n, available: false, sortOrder: 2 },
          { name: 'Olives', priceMinor: 1000n, sortOrder: 3 },
        ],
      },
    },
  });

  const blockedRequired = await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-required-empty' },
    update: {
      isPublished: true,
      availability: 'AVAILABLE',
      name: 'DEV Required Empty Toppings',
      description: 'Required group with no valid available selection',
    },
    create: {
      legacyId: 'seed-item-required-empty',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      name: 'DEV Required Empty Toppings',
      description: 'Required group with no valid available selection',
      availability: 'AVAILABLE',
      isPublished: true,
    },
  });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: blockedRequired.id } });
  await prisma.itemVariant.create({
    data: {
      menuItemId: blockedRequired.id,
      size: 'Regular',
      sku: 'DEV-REQ-EMPTY',
      priceMinor: 14900n,
      currencyCode: 'INR',
      available: true,
    },
  });
  await prisma.addOnGroup.deleteMany({ where: { menuItemId: blockedRequired.id } });
  await prisma.addOnGroup.create({
    data: {
      menuItemId: blockedRequired.id,
      name: 'Must pick',
      minSelect: 1,
      maxSelect: 1,
      available: true,
      addOns: {
        create: [{ name: 'None left', priceMinor: 0n, available: false, isDefault: true }],
      },
    },
  });

  const lassi = await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-lassi' },
    update: {
      isPublished: true,
      availability: 'AVAILABLE',
      menuSectionId: section.id,
      name: 'DEV Mango Lassi',
      description: 'Complementary drink for Stage G cross-sell',
    },
    create: {
      legacyId: 'seed-item-lassi',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      menuSectionId: section.id,
      name: 'DEV Mango Lassi',
      description: 'Complementary drink for Stage G cross-sell',
      availability: 'AVAILABLE',
      isPublished: true,
    },
  });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: lassi.id } });
  await prisma.itemVariant.create({
    data: {
      menuItemId: lassi.id,
      size: 'Regular',
      sku: 'DEV-LASSI-REG',
      priceMinor: 7900n,
      currencyCode: 'INR',
      isDefault: true,
      available: true,
    },
  });

  const unpublishedSide = await prisma.menuItem.upsert({
    where: { legacyId: 'seed-item-unpublished-side' },
    update: { isPublished: false, availability: 'AVAILABLE', name: 'DEV Hidden Papad' },
    create: {
      legacyId: 'seed-item-unpublished-side',
      merchantId: merchant.id,
      restaurantId: restaurant.id,
      name: 'DEV Hidden Papad',
      description: 'Unpublished complementary target',
      availability: 'AVAILABLE',
      isPublished: false,
    },
  });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: unpublishedSide.id } });
  await prisma.itemVariant.create({
    data: {
      menuItemId: unpublishedSide.id,
      size: 'Regular',
      sku: 'DEV-PAPAD',
      priceMinor: 2900n,
      currencyCode: 'INR',
      available: true,
    },
  });

  await prisma.merchandisingRelation.deleteMany({
    where: { sourceItemId: item.id },
  });
  await prisma.merchandisingRelation.createMany({
    data: [
      {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'CROSS_SELL',
        sourceItemId: item.id,
        targetItemId: lassi.id,
        sortOrder: 1,
        status: 'ACTIVE',
      },
      {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'CROSS_SELL',
        sourceItemId: item.id,
        targetItemId: sold.id,
        sortOrder: 2,
        status: 'ACTIVE',
      },
      {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'CROSS_SELL',
        sourceItemId: item.id,
        targetItemId: unpublishedSide.id,
        sortOrder: 3,
        status: 'ACTIVE',
      },
    ],
  });

  const closedMerchant = await prisma.merchant.upsert({
    where: { legacyId: 'seed-merchant-closed' },
    update: {},
    create: { legacyId: 'seed-merchant-closed', legalName: 'DEV Closed Foods' },
  });
  await prisma.restaurant.upsert({
    where: { legacyId: 'seed-restaurant-closed' },
    update: { status: 'CLOSED' },
    create: {
      legacyId: 'seed-restaurant-closed',
      merchantId: closedMerchant.id,
      name: 'DEV Closed Kitchen',
      city: 'Pune',
      status: 'CLOSED',
    },
  });

  const globalSourcePayload = {
    product: {
      variants: [
        {
          size: 'Regular',
          sku: 'DEV-GLOBAL-THALI',
          priceMinor: '29900',
          currencyCode: 'INR',
          isDefault: true,
          available: true,
        },
      ],
      addOnGroups: [
        {
          name: 'Raita',
          minSelect: 0,
          maxSelect: 1,
          allowQuantity: false,
          available: true,
          addOns: [
            {
              name: 'Boondi',
              priceMinor: '2000',
              available: true,
              variantPrices: [{ sku: 'DEV-GLOBAL-THALI', priceMinor: '2500' }],
            },
          ],
        },
      ],
      channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: true }],
    },
  };
  const globalCatalogRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "platform_catalogs"
      ("legacy_id", "name", "description", "cuisine_type", "status", "created_by", "updated_by")
    VALUES
      ('seed-global-catalog-1', 'DEV Global North Indian', 'Synthetic Super Admin source catalog',
       'North Indian', 'ACTIVE', ${adminId}::uuid, ${adminId}::uuid)
    ON CONFLICT ("legacy_id") DO UPDATE
      SET "name" = EXCLUDED."name",
          "description" = EXCLUDED."description",
          "updated_by" = EXCLUDED."updated_by",
          "updated_at" = CURRENT_TIMESTAMP
    RETURNING "id"
  `;
  const globalCatalogId = globalCatalogRows[0].id;
  const globalCategoryRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "platform_catalog_categories"
      ("legacy_id", "catalog_id", "name", "description", "sort_order")
    VALUES
      ('seed-global-category-1', ${globalCatalogId}::uuid, 'Mains', 'Global mains', 1)
    ON CONFLICT ("legacy_id") DO UPDATE
      SET "name" = EXCLUDED."name",
          "catalog_id" = EXCLUDED."catalog_id"
    RETURNING "id"
  `;
  const globalCategoryId = globalCategoryRows[0].id;
  const globalItemRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "platform_catalog_items"
      ("legacy_id", "catalog_id", "category_id", "name", "description", "source_payload")
    VALUES
      ('seed-global-item-1', ${globalCatalogId}::uuid, ${globalCategoryId}::uuid,
       'DEV Global Thali', 'Reusable Super Admin source item',
       ${JSON.stringify(globalSourcePayload)}::jsonb)
    ON CONFLICT ("legacy_id") DO UPDATE
      SET "name" = EXCLUDED."name",
          "description" = EXCLUDED."description",
          "source_payload" = EXCLUDED."source_payload",
          "catalog_id" = EXCLUDED."catalog_id",
          "category_id" = EXCLUDED."category_id"
    RETURNING "id"
  `;

  console.log('Seed complete (synthetic dev data):', {
    merchant: merchant.id,
    restaurant: restaurant.id,
    menuItem: item.id,
    user: user.id,
    superAdmin: adminId,
    globalCatalog: globalCatalogId,
    globalItem: globalItemRows[0].id,
  });
}

// Deterministic UUID v5-ish helper (stable across runs) for entities lacking a natural unique key.
import { createHash } from 'node:crypto';
async function stableId(label: string, scope: string): Promise<string> {
  const h = createHash('sha1').update(`${label}:${scope}`).digest('hex');
  // format as UUID
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** class-validator @IsUUID() rejects sha1-as-UUID (invalid version/variant). */
function rfcUuid(value: string): string {
  const hex = value.replace(/-/g, '').slice(0, 32).padEnd(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
