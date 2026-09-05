/**
 * Minimal, clearly-synthetic development seed data (P1.5).
 * NOT production data. No financial history is created.
 * Idempotent: safe to run repeatedly (keyed on stable synthetic identifiers).
 *
 * Provides enough data to develop/test: users, roles, restaurant, location,
 * menu, menu item.
 */
import { PrismaClient } from '@prisma/client';

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
  await prisma.staffMember.upsert({
    where: { id: await stableId('staff-owner', merchant.id) },
    update: {},
    create: {
      id: await stableId('staff-owner', merchant.id),
      merchantId: merchant.id,
      name: 'DEV Owner',
      email: 'dev.owner@example.test',
      staffRole: 'MERCHANT_OWNER',
      roleId: role.id,
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
      uomId: uom.id,
      priceMinor: 24900n, // ₹249.00 in paise
      currencyCode: 'INR',
      available: true,
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

  console.log('Seed complete (synthetic dev data):', {
    merchant: merchant.id,
    restaurant: restaurant.id,
    menuItem: item.id,
    user: user.id,
  });
}

// Deterministic UUID v5-ish helper (stable across runs) for entities lacking a natural unique key.
import { createHash } from 'node:crypto';
async function stableId(label: string, scope: string): Promise<string> {
  const h = createHash('sha1').update(`${label}:${scope}`).digest('hex');
  // format as UUID
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
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
