import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Doc 98 — consumer saved-address HTTP. Book only. No geo. No checkout.
 */
describe('Consumer addresses (doc 98 HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = 'Secret123!';
  const http = () => request(app.getHttpServer());
  const missingId = '00000000-0000-4000-8000-000000000099';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const body = { phoneCountryCode: '+91', phone, password: PASSWORD };
    const created = await http().post('/api/v1/auth/consumer/register').send(body);
    expect(created.status).toBe(201);
    const login = await http().post('/api/v1/auth/consumer/login').send(body);
    expect(login.status).toBe(200);
    return { token: login.body.accessToken as string, userId: created.body.id as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function expectBookShape(row: Record<string, unknown>) {
    expect(row).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        line1: expect.any(String),
        isDefault: expect.any(Boolean),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    );
    expect(row).not.toHaveProperty('userId');
    expect(row).not.toHaveProperty('lat');
    expect(row).not.toHaveProperty('lon');
    expect(row).not.toHaveProperty('legacyId');
    expect(row).not.toHaveProperty('deletedAt');
  }

  it('rejects unauthenticated GET, POST, PATCH, and DELETE', async () => {
    expect((await http().get('/api/v1/me/addresses')).status).toBe(401);
    expect((await http().post('/api/v1/me/addresses').send({ line1: '1 Street' })).status).toBe(
      401,
    );
    expect(
      (await http().patch(`/api/v1/me/addresses/${missingId}`).send({ city: 'Pune' })).status,
    ).toBe(401);
    expect((await http().delete(`/api/v1/me/addresses/${missingId}`)).status).toBe(401);
  });

  it('creates without coordinates, lists, updates, and persists after reload', async () => {
    const a = await registerConsumer();

    const created = await http().post('/api/v1/me/addresses').set(auth(a.token)).send({
      label: 'Home',
      line1: '12 MG Road',
      line2: 'Apt 4',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560001',
    });
    expect(created.status).toBe(201);
    expectBookShape(created.body);
    expect(created.body).toMatchObject({
      label: 'Home',
      line1: '12 MG Road',
      line2: 'Apt 4',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560001',
      isDefault: true,
    });

    const stored = await prisma.address.findUnique({ where: { id: created.body.id } });
    expect(stored?.userId).toBe(a.userId);
    expect(stored?.lat).toBeNull();
    expect(stored?.lon).toBeNull();
    expect(stored?.deletedAt).toBeNull();

    const listed = await http().get('/api/v1/me/addresses').set(auth(a.token));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expectBookShape(listed.body.data[0]);
    expect(listed.body.data[0].id).toBe(created.body.id);

    const patched = await http()
      .patch(`/api/v1/me/addresses/${created.body.id}`)
      .set(auth(a.token))
      .send({ line2: 'Apt 5', city: 'Pune' });
    expect(patched.status).toBe(200);
    expect(patched.body.line2).toBe('Apt 5');
    expect(patched.body.city).toBe('Pune');
    expect(patched.body.line1).toBe('12 MG Road');

    const reload = await http().get('/api/v1/me/addresses').set(auth(a.token));
    expect(reload.body.data[0]).toMatchObject({
      id: created.body.id,
      line2: 'Apt 5',
      city: 'Pune',
    });
  });

  it('soft-deletes, hides from GET, rejects PATCH, and treats DELETE as idempotent', async () => {
    const a = await registerConsumer();
    const created = await http()
      .post('/api/v1/me/addresses')
      .set(auth(a.token))
      .send({ line1: 'Delete Me' });
    expect(created.status).toBe(201);

    const removed = await http()
      .delete(`/api/v1/me/addresses/${created.body.id}`)
      .set(auth(a.token));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ id: created.body.id });

    const again = await http().delete(`/api/v1/me/addresses/${created.body.id}`).set(auth(a.token));
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ id: created.body.id });

    const listed = await http().get('/api/v1/me/addresses').set(auth(a.token));
    expect(listed.body.data).toEqual([]);

    const patchDeleted = await http()
      .patch(`/api/v1/me/addresses/${created.body.id}`)
      .set(auth(a.token))
      .send({ city: 'Goa' });
    expect(patchDeleted.status).toBe(404);

    const row = await prisma.address.findUnique({ where: { id: created.body.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.line1).toBe('Delete Me');
  });

  it('rejects invalid UUIDs, unknown fields, userId, lat, lon, and blank line1', async () => {
    const a = await registerConsumer();
    const created = await http()
      .post('/api/v1/me/addresses')
      .set(auth(a.token))
      .send({ line1: 'Valid' });
    expect(created.status).toBe(201);

    expect((await http().post('/api/v1/me/addresses').set(auth(a.token)).send({})).status).toBe(
      400,
    );
    expect(
      (await http().post('/api/v1/me/addresses').set(auth(a.token)).send({ line1: '   ' })).status,
    ).toBe(400);
    expect(
      (
        await http()
          .patch(`/api/v1/me/addresses/${created.body.id}`)
          .set(auth(a.token))
          .send({ line1: '' })
      ).status,
    ).toBe(400);
    expect(
      (
        await http()
          .post('/api/v1/me/addresses')
          .set(auth(a.token))
          .send({ line1: 'X', userId: a.userId })
      ).status,
    ).toBe(400);
    expect(
      (await http().post('/api/v1/me/addresses').set(auth(a.token)).send({ line1: 'X', lat: 12.9 }))
        .status,
    ).toBe(400);
    expect(
      (await http().post('/api/v1/me/addresses').set(auth(a.token)).send({ line1: 'X', lon: 77.6 }))
        .status,
    ).toBe(400);
    expect(
      (
        await http()
          .post('/api/v1/me/addresses')
          .set(auth(a.token))
          .send({ line1: 'X', extra: true })
      ).status,
    ).toBe(400);
    expect(
      (await http().patch('/api/v1/me/addresses/not-a-uuid').set(auth(a.token)).send({ city: 'X' }))
        .status,
    ).toBe(400);
    expect((await http().delete('/api/v1/me/addresses/not-a-uuid').set(auth(a.token))).status).toBe(
      400,
    );
    expect(
      (
        await http()
          .patch(`/api/v1/me/addresses/${missingId}`)
          .set(auth(a.token))
          .send({ city: 'X' })
      ).status,
    ).toBe(404);
  });

  it('clears sibling defaults and does not auto-promote after clear or delete', async () => {
    const a = await registerConsumer();
    const first = await http()
      .post('/api/v1/me/addresses')
      .set(auth(a.token))
      .send({ label: 'Home', line1: 'First' });
    expect(first.status).toBe(201);
    expect(first.body.isDefault).toBe(true);

    const second = await http()
      .post('/api/v1/me/addresses')
      .set(auth(a.token))
      .send({ label: 'Work', line1: 'Second', isDefault: true });
    expect(second.status).toBe(201);
    expect(second.body.isDefault).toBe(true);

    const afterSecond = await http().get('/api/v1/me/addresses').set(auth(a.token));
    expect(afterSecond.body.data).toHaveLength(2);
    expect(afterSecond.body.data[0].id).toBe(second.body.id);
    expect(afterSecond.body.data[0].isDefault).toBe(true);
    expect(
      afterSecond.body.data.find((row: { id: string }) => row.id === first.body.id).isDefault,
    ).toBe(false);

    const cleared = await http()
      .patch(`/api/v1/me/addresses/${second.body.id}`)
      .set(auth(a.token))
      .send({ isDefault: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.isDefault).toBe(false);

    const afterClear = await http().get('/api/v1/me/addresses').set(auth(a.token));
    expect(
      afterClear.body.data.every((row: { isDefault: boolean }) => row.isDefault === false),
    ).toBe(true);

    await http()
      .patch(`/api/v1/me/addresses/${first.body.id}`)
      .set(auth(a.token))
      .send({ isDefault: true });
    await http().delete(`/api/v1/me/addresses/${first.body.id}`).set(auth(a.token));

    const afterDelete = await http().get('/api/v1/me/addresses').set(auth(a.token));
    expect(afterDelete.body.data).toHaveLength(1);
    expect(afterDelete.body.data[0].id).toBe(second.body.id);
    expect(afterDelete.body.data[0].isDefault).toBe(false);
  });

  it('isolates consumers: A cannot see or mutate B', async () => {
    const a = await registerConsumer();
    const b = await registerConsumer();
    const bAddress = await http()
      .post('/api/v1/me/addresses')
      .set(auth(b.token))
      .send({ line1: 'B only', city: 'Chennai', isDefault: true });
    expect(bAddress.status).toBe(201);

    const aList = await http().get('/api/v1/me/addresses').set(auth(a.token));
    expect(aList.body.data).toEqual([]);

    const aPatch = await http()
      .patch(`/api/v1/me/addresses/${bAddress.body.id}`)
      .set(auth(a.token))
      .send({ city: 'Hacked' });
    expect(aPatch.status).toBe(404);

    const aDelete = await http()
      .delete(`/api/v1/me/addresses/${bAddress.body.id}`)
      .set(auth(a.token));
    expect(aDelete.status).toBe(200);
    expect(aDelete.body).toEqual({ id: bAddress.body.id });

    const bList = await http().get('/api/v1/me/addresses').set(auth(b.token));
    expect(bList.body.data).toHaveLength(1);
    expect(bList.body.data[0]).toMatchObject({
      id: bAddress.body.id,
      line1: 'B only',
      city: 'Chennai',
      isDefault: true,
    });
    expect(bList.body.data[0].userId).toBeUndefined();

    const stored = await prisma.address.findUnique({ where: { id: bAddress.body.id } });
    expect(stored?.userId).toBe(b.userId);
    expect(stored?.deletedAt).toBeNull();
    expect(stored?.city).toBe('Chennai');
  });
});
