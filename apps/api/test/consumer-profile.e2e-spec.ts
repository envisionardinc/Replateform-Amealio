import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Doc 96 — consumer profile + dietary preferences HTTP.
 */
describe('Consumer profile (doc 96 HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = 'Secret123!';
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

  async function registerConsumer(over: Record<string, unknown> = {}) {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const body = { phoneCountryCode: '+91', phone, password: PASSWORD, ...over };
    const created = await http().post('/api/v1/auth/consumer/register').send(body);
    expect(created.status).toBe(201);
    const login = await http().post('/api/v1/auth/consumer/login').send({
      phoneCountryCode: body.phoneCountryCode,
      phone: body.phone,
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    return { token: login.body.accessToken as string, userId: created.body.id as string, phone };
  }

  it('rejects unauthenticated GET and PATCH', async () => {
    expect((await http().get('/api/v1/me/profile')).status).toBe(401);
    expect((await http().patch('/api/v1/me/profile').send({ email: 'a@b.co' })).status).toBe(401);
  });

  it('returns defaults when no UserProfile row exists', async () => {
    const a = await registerConsumer();
    const res = await http().get('/api/v1/me/profile').set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: a.userId,
      phone: a.phone,
      email: null,
      detailsSubmitted: false,
      completionPercentage: 0,
      preferences: { dietary_preferences: [], allergies: [] },
    });
  });

  it('patches email and dietary preferences and persists after reload', async () => {
    const a = await registerConsumer();
    const email = `${uniq('p')}@example.test`;
    const patch = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        email,
        preferences: {
          dietary_preferences: ['Vegetarian', 'Jain'],
          allergies: ['Nuts'],
        },
      });
    expect(patch.status).toBe(200);
    expect(patch.body.email).toBe(email.toLowerCase());
    expect(patch.body.preferences.dietary_preferences).toEqual(['Vegetarian', 'Jain']);
    expect(patch.body.preferences.allergies).toEqual(['Nuts']);

    const again = await http().get('/api/v1/me/profile').set('Authorization', `Bearer ${a.token}`);
    expect(again.body.email).toBe(email.toLowerCase());
    expect(again.body.preferences).toEqual({
      dietary_preferences: ['Vegetarian', 'Jain'],
      allergies: ['Nuts'],
    });
    const row = await prisma.userProfile.findUniqueOrThrow({ where: { userId: a.userId } });
    expect(row.preferences).toEqual({
      dietary_preferences: ['Vegetarian', 'Jain'],
      allergies: ['Nuts'],
    });
  });

  it('partial PATCH leaves omitted fields unchanged and null clears', async () => {
    const a = await registerConsumer({ email: `${uniq('keep')}@example.test` });
    await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        preferences: { dietary_preferences: ['Vegan'], allergies: ['Dairy'] },
      });
    const partial = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ preferences: { allergies: null } });
    expect(partial.status).toBe(200);
    expect(partial.body.preferences.dietary_preferences).toEqual(['Vegan']);
    expect(partial.body.preferences.allergies).toEqual([]);
    expect(partial.body.email).toContain('@example.test');

    const empty = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({});
    expect(empty.status).toBe(200);
    expect(empty.body.preferences.dietary_preferences).toEqual(['Vegan']);
  });

  it('preserves unrelated stored preference keys and rejects unknown PATCH fields', async () => {
    const a = await registerConsumer();
    await prisma.userProfile.create({
      data: {
        userId: a.userId,
        preferences: { language: 'en', celebration_subcategory: ['birthday'] },
      },
    });
    const ok = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ preferences: { dietary_preferences: ['Vegetarian'] } });
    expect(ok.status).toBe(200);
    expect(ok.body.preferences).toEqual({ dietary_preferences: ['Vegetarian'], allergies: [] });
    expect(ok.body.preferences).not.toHaveProperty('language');
    const stored = await prisma.userProfile.findUniqueOrThrow({ where: { userId: a.userId } });
    expect(stored.preferences).toEqual({
      language: 'en',
      celebration_subcategory: ['birthday'],
      dietary_preferences: ['Vegetarian'],
    });

    const unknown = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ userId: a.userId, preferences: { dietary_preferences: ['Vegan'] } });
    expect(unknown.status).toBe(400);

    const owned = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ detailsSubmitted: true, completionPercentage: 99 });
    expect(owned.status).toBe(400);
    const after = await prisma.userProfile.findUniqueOrThrow({ where: { userId: a.userId } });
    expect(after.detailsSubmitted).toBe(false);
    expect(after.completionPercentage).toBe(0);

    const cuisine = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ preferences: { selected_cuisine: ['thai'] } });
    expect(cuisine.status).toBe(400);

    const phone = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ phone: '9888888888' });
    expect(phone.status).toBe(400);
  });

  it('rejects invalid email and email collisions', async () => {
    const a = await registerConsumer();
    const b = await registerConsumer();
    const taken = `${uniq('taken')}@example.test`;
    expect(
      (
        await http()
          .patch('/api/v1/me/profile')
          .set('Authorization', `Bearer ${b.token}`)
          .send({ email: taken })
      ).status,
    ).toBe(200);

    const invalid = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ email: 'not-an-email' });
    expect(invalid.status).toBe(400);

    const clash = await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ email: taken });
    expect(clash.status).toBe(409);
  });

  it('isolates consumers: A cannot read or write B', async () => {
    const a = await registerConsumer();
    const b = await registerConsumer();
    await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ preferences: { dietary_preferences: ['Vegan'] } });

    const aGet = await http().get('/api/v1/me/profile').set('Authorization', `Bearer ${a.token}`);
    expect(aGet.body.userId).toBe(a.userId);
    expect(aGet.body.preferences.dietary_preferences).toEqual([]);

    await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        userId: b.userId,
        preferences: { dietary_preferences: ['Vegetarian'] },
      })
      .expect(400);

    await http()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ preferences: { dietary_preferences: ['Jain'] } });

    const bGet = await http().get('/api/v1/me/profile').set('Authorization', `Bearer ${b.token}`);
    expect(bGet.body.userId).toBe(b.userId);
    expect(bGet.body.preferences.dietary_preferences).toEqual(['Vegan']);
  });
});
