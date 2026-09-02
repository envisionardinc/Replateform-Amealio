import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Consumer authentication end-to-end (P1.7.1B) against the TEST database.
 * Synthetic data only; no legacy/production users.
 */
describe('Consumer authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const base = '/api/v1/auth/consumer';

  const uniquePhone = () => `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
  const reg = (over: Record<string, unknown> = {}) => ({
    phoneCountryCode: '+91',
    phone: uniquePhone(),
    password: 'Secret123!',
    ...over,
  });

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('registration', () => {
    it('registers a consumer and never returns credentials', async () => {
      const body = reg();
      const res = await http().post(`${base}/register`).send(body);
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.phone).toBe(body.phone);
      expect(res.body.isVerified).toBe(false);
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.password).toBeUndefined();
    });

    it('rejects a duplicate phone (409)', async () => {
      const body = reg();
      await http().post(`${base}/register`).send(body).expect(201);
      const res = await http().post(`${base}/register`).send(body);
      expect(res.status).toBe(409);
    });

    it('rejects invalid input (400)', async () => {
      await http().post(`${base}/register`).send({ phone: 'abc', password: 'x' }).expect(400);
    });
  });

  describe('login + access token', () => {
    it('logs in with valid credentials and issues Bearer + refresh tokens', async () => {
      const body = reg();
      await http().post(`${base}/register`).send(body).expect(201);
      const res = await http().post(`${base}/login`).send({
        phoneCountryCode: body.phoneCountryCode,
        phone: body.phone,
        password: body.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.tokenType).toBe('Bearer');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.refreshToken).toMatch(/\./);
      expect(res.body.expiresIn).toBeGreaterThan(0);
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('rejects an invalid password and an unknown account uniformly (401)', async () => {
      const body = reg();
      await http().post(`${base}/register`).send(body).expect(201);
      await http()
        .post(`${base}/login`)
        .send({
          phoneCountryCode: body.phoneCountryCode,
          phone: body.phone,
          password: 'wrong-pass',
        })
        .expect(401);
      await http()
        .post(`${base}/login`)
        .send({ phoneCountryCode: '+91', phone: uniquePhone(), password: 'whatever' })
        .expect(401);
    });

    it('rejects a blocked account (403)', async () => {
      const body = reg();
      const created = await http().post(`${base}/register`).send(body).expect(201);
      await prisma.user.update({ where: { id: created.body.id }, data: { isBlocked: true } });
      await http()
        .post(`${base}/login`)
        .send({
          phoneCountryCode: body.phoneCountryCode,
          phone: body.phone,
          password: body.password,
        })
        .expect(403);
    });

    it('accepts a valid Bearer token on /me and rejects missing/malformed tokens', async () => {
      const body = reg();
      await http().post(`${base}/register`).send(body).expect(201);
      const login = await http()
        .post(`${base}/login`)
        .send({
          phoneCountryCode: body.phoneCountryCode,
          phone: body.phone,
          password: body.password,
        })
        .expect(200);
      const me = await http()
        .get(`${base}/me`)
        .set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.phone).toBe(body.phone);
      expect(me.body.passwordHash).toBeUndefined();
      await http().get(`${base}/me`).expect(401); // missing
      await http().get(`${base}/me`).set('Authorization', 'Bearer not.a.jwt').expect(401); // malformed
      await http().get(`${base}/me`).set('Authorization', login.body.accessToken).expect(401); // raw (no Bearer)
    });
  });

  describe('refresh rotation, replay, logout', () => {
    async function loginFresh() {
      const body = reg();
      await http().post(`${base}/register`).send(body).expect(201);
      const res = await http()
        .post(`${base}/login`)
        .send({
          phoneCountryCode: body.phoneCountryCode,
          phone: body.phone,
          password: body.password,
        })
        .expect(200);
      return res.body as { accessToken: string; refreshToken: string };
    }

    it('refreshes and rotates the refresh token', async () => {
      const { refreshToken } = await loginFresh();
      const res = await http().post(`${base}/refresh`).send({ refreshToken }).expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('detects replay of a rotated refresh token and revokes the session', async () => {
      const { refreshToken: r1 } = await loginFresh();
      const rotated = await http().post(`${base}/refresh`).send({ refreshToken: r1 }).expect(200);
      const r2 = rotated.body.refreshToken as string;
      // replay r1 -> 401 + session revoked
      await http().post(`${base}/refresh`).send({ refreshToken: r1 }).expect(401);
      // r2 now also invalid because the session was revoked
      await http().post(`${base}/refresh`).send({ refreshToken: r2 }).expect(401);
    });

    it('rejects an invalid/garbage refresh token (401)', async () => {
      await http().post(`${base}/refresh`).send({ refreshToken: 'sXXX.deadbeef' }).expect(401);
    });

    it('logout revokes the session; subsequent refresh fails; logout is idempotent', async () => {
      const { refreshToken } = await loginFresh();
      await http().post(`${base}/logout`).send({ refreshToken }).expect(204);
      await http().post(`${base}/refresh`).send({ refreshToken }).expect(401);
      await http().post(`${base}/logout`).send({ refreshToken }).expect(204); // idempotent
    });
  });
});
