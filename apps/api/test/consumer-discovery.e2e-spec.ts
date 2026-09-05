import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Doc 92 — public consumer discovery over existing Restaurant/MenuItem rows.
 */
describe('Consumer discovery (doc 92 public HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  async function seedRestaurant(over: { status?: string; city?: string; deleted?: boolean } = {}) {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: {
        merchantId: merchant.id,
        name: uniq('Cafe'),
        city: over.city ?? 'Pune',
        status: over.status ?? 'ACTIVE',
        deletedAt: over.deleted ? new Date() : null,
      },
    });
    const published = await prisma.menuItem.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        name: 'Idli',
        availability: 'AVAILABLE',
        isPublished: true,
        variants: {
          create: [{ size: 'Reg', priceMinor: 10000n, currencyCode: 'INR', available: true }],
        },
      },
      include: { variants: true },
    });
    const hidden = await prisma.menuItem.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        name: 'Secret',
        availability: 'AVAILABLE',
        isPublished: false,
        variants: {
          create: [{ size: 'Reg', priceMinor: 5000n, currencyCode: 'INR', available: true }],
        },
      },
    });
    const sold = await prisma.menuItem.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        name: 'Sold Dosa',
        availability: 'SOLDOUT',
        isPublished: true,
        variants: {
          create: [{ size: 'Reg', priceMinor: 12000n, currencyCode: 'INR', available: false }],
        },
      },
    });
    return { merchant, restaurant, published, hidden, sold };
  }

  it('lists ACTIVE restaurants on canonical home and hides inactive/deleted', async () => {
    const live = await seedRestaurant({ city: 'Pune' });
    const closed = await seedRestaurant({ status: 'INACTIVE' });
    const gone = await seedRestaurant({ deleted: true });

    const home = await http().get('/api/v1/discover/home');
    expect(home.status).toBe(200);
    expect(home.body.source).toBe('CANONICAL');
    const ids = home.body.sections[0].restaurants.map((r: { id: string }) => r.id);
    expect(ids).toContain(live.restaurant.id);
    expect(ids).not.toContain(closed.restaurant.id);
    expect(ids).not.toContain(gone.restaurant.id);

    const list = await http().get('/api/v1/discover/restaurants').query({ city: 'Pune' });
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toContain(live.restaurant.id);

    const empty = await http().get('/api/v1/discover/restaurants').query({ q: 'zzzz-no-such' });
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);
  });

  it('returns restaurant + published menu; 404 for unavailable restaurant and unpublished item', async () => {
    const live = await seedRestaurant();
    const detail = await http().get(`/api/v1/discover/restaurants/${live.restaurant.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.name).toBe(live.restaurant.name);

    const menu = await http().get(`/api/v1/discover/restaurants/${live.restaurant.id}/menu`);
    expect(menu.status).toBe(200);
    const names = menu.body.items.map((i: { name: string }) => i.name);
    expect(names).toContain('Idli');
    expect(names).toContain('Sold Dosa');
    expect(names).not.toContain('Secret');
    expect(
      menu.body.items.find((i: { name: string }) => i.name === 'Idli').variants[0].priceMinor,
    ).toBe('10000');

    const item = await http().get(`/api/v1/discover/items/${live.published.id}`);
    expect(item.status).toBe(200);
    expect(item.body.isPublished).toBe(true);

    expect((await http().get(`/api/v1/discover/items/${live.hidden.id}`)).status).toBe(404);

    const closed = await seedRestaurant({ status: 'CLOSED' });
    expect((await http().get(`/api/v1/discover/restaurants/${closed.restaurant.id}`)).status).toBe(
      404,
    );
    expect(
      (await http().get(`/api/v1/discover/restaurants/${closed.restaurant.id}/menu`)).status,
    ).toBe(404);
  });

  it('does not require authentication and does not use staff catalog routes', async () => {
    const live = await seedRestaurant();
    const res = await http().get('/api/v1/discover/restaurants');
    expect(res.status).toBe(200);
    const staff = await http().get(`/api/v1/catalog/restaurants/${live.restaurant.id}/items`);
    expect(staff.status).toBe(401);
  });
});
