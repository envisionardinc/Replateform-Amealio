import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Staff/admin authentication end-to-end (P1.7.1E) against the TEST database.
 * Controlled synthetic fixtures only — NO legacy VendorUser/admin data is
 * imported and NO MongoDB is read. Passwords are hashed with bcrypt here to
 * simulate credentials that a future controlled import would create.
 */
describe('Staff/admin authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const base = '/api/v1/auth/staff';
  const consumerBase = '/api/v1/auth/consumer';
  const PASSWORD = 'StaffSecret123!';

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function makeMerchant() {
    return prisma.merchant.create({ data: { legalName: uniq('M') } });
  }

  /** Create a controlled StaffMember + PASSWORD credential. */
  async function makeStaff(opts: {
    merchantId: string | null;
    staffRole?: 'MERCHANT_OWNER' | 'MERCHANT_STAFF' | 'SUPER_ADMIN';
    status?: 'ACTIVE' | 'BLOCKED';
    email?: string;
    phone?: string;
    withCredential?: boolean;
  }) {
    const email = opts.email ?? `${uniq('staff')}@example.test`;
    const staff = await prisma.staffMember.create({
      data: {
        merchantId: opts.merchantId ?? undefined,
        name: 'DEV Staff',
        email,
        phone: opts.phone,
        staffRole: opts.staffRole ?? 'MERCHANT_STAFF',
        status: opts.status ?? 'ACTIVE',
      },
    });
    if (opts.withCredential !== false) {
      await prisma.staffCredential.create({
        data: {
          staffMemberId: staff.id,
          type: 'PASSWORD',
          secretHash: await bcrypt.hash(PASSWORD, 10),
        },
      });
    }
    return { staff, email };
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const loginBy = (identifier: { email?: string; phone?: string }, password = PASSWORD) =>
    http()
      .post(`${base}/login`)
      .send({ ...identifier, password });

  describe('login', () => {
    it('merchant staff logs in and receives Bearer + refresh tokens (merchant scope)', async () => {
      const m = await makeMerchant();
      const { email } = await makeStaff({ merchantId: m.id, staffRole: 'MERCHANT_OWNER' });
      const res = await loginBy({ email }).expect(200);
      expect(res.body.tokenType).toBe('Bearer');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.refreshToken).toMatch(/\./);
      expect(res.body.expiresIn).toBeGreaterThan(0);
      expect(res.body.staff.merchantId).toBe(m.id);
      expect(res.body.staff.staffRole).toBe('MERCHANT_OWNER');
    });

    it('SUPER_ADMIN (merchantId NULL) logs in with a null merchant scope', async () => {
      const { email } = await makeStaff({ merchantId: null, staffRole: 'SUPER_ADMIN' });
      const res = await loginBy({ email }).expect(200);
      expect(res.body.staff.merchantId).toBeNull();
      expect(res.body.staff.staffRole).toBe('SUPER_ADMIN');
    });

    it('logs in by phone identifier', async () => {
      const phone = uniq('90000').replace(/\D/g, '');
      await makeStaff({ merchantId: null, phone });
      await http().post(`${base}/login`).send({ phone, password: PASSWORD }).expect(200);
    });

    it('rejects an unknown identifier and a wrong password uniformly (401)', async () => {
      const { email } = await makeStaff({ merchantId: null });
      await loginBy({ email: `${uniq('nobody')}@example.test` }).expect(401); // unknown
      await loginBy({ email }, 'wrong-password').expect(401); // wrong password
    });

    it('rejects a blocked account (403)', async () => {
      const { email } = await makeStaff({ merchantId: null, status: 'BLOCKED' });
      await loginBy({ email }).expect(403);
    });

    it('rejects a deleted account (401, no existence disclosure)', async () => {
      const { staff, email } = await makeStaff({ merchantId: null });
      await prisma.staffMember.update({ where: { id: staff.id }, data: { deletedAt: new Date() } });
      await loginBy({ email }).expect(401);
    });

    it('never exposes credential material in the login response', async () => {
      const { email } = await makeStaff({ merchantId: null });
      const res = await loginBy({ email }).expect(200);
      const blob = JSON.stringify(res.body);
      expect(res.body.staff.secretHash).toBeUndefined();
      expect(res.body.staff.passwordHash).toBeUndefined();
      expect(blob).not.toMatch(/secretHash|passwordHash/);
    });
  });

  describe('access token + guard (/me)', () => {
    async function loginFresh(over: Parameters<typeof makeStaff>[0] = { merchantId: null }) {
      const { staff, email } = await makeStaff(over);
      const res = await loginBy({ email }).expect(200);
      return { staff, tokens: res.body as { accessToken: string; refreshToken: string } };
    }

    it('accepts a valid Bearer token on /me and returns non-credential profile', async () => {
      const m = await makeMerchant();
      const { tokens } = await loginFresh({ merchantId: m.id });
      const me = await http()
        .get(`${base}/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.merchantId).toBe(m.id);
      expect(me.body.staffRole).toBeDefined();
      expect(me.body.secretHash).toBeUndefined();
      expect(me.body.passwordHash).toBeUndefined();
    });

    it('rejects missing, malformed, and raw (non-Bearer) Authorization', async () => {
      const { tokens } = await loginFresh();
      await http().get(`${base}/me`).expect(401); // missing
      await http().get(`${base}/me`).set('Authorization', 'Bearer not.a.jwt').expect(401); // malformed
      await http().get(`${base}/me`).set('Authorization', tokens.accessToken).expect(401); // raw legacy header
    });

    it('SUPER_ADMIN /me exposes a null merchant scope', async () => {
      const { tokens } = await loginFresh({ merchantId: null, staffRole: 'SUPER_ADMIN' });
      const me = await http()
        .get(`${base}/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect(me.body.merchantId).toBeNull();
      expect(me.body.staffRole).toBe('SUPER_ADMIN');
    });

    it('rejects a consumer JWT on the staff guard (wrong actor type)', async () => {
      // Register + login a consumer to obtain a real consumer access token.
      const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
      await http()
        .post(`${consumerBase}/register`)
        .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' })
        .expect(201);
      const consumerLogin = await http()
        .post(`${consumerBase}/login`)
        .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' })
        .expect(200);
      await http()
        .get(`${base}/me`)
        .set('Authorization', `Bearer ${consumerLogin.body.accessToken}`)
        .expect(401);
    });

    it('rejects a staff JWT on the consumer guard', async () => {
      const { tokens } = await loginFresh();
      await http()
        .get(`${consumerBase}/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
    });

    it('rejects a blocked staff at the guard after status change', async () => {
      const { staff, tokens } = await loginFresh({ merchantId: null });
      await prisma.staffMember.update({ where: { id: staff.id }, data: { status: 'BLOCKED' } });
      await http()
        .get(`${base}/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
    });

    it('rejects a deleted staff at the guard after deletion', async () => {
      const { staff, tokens } = await loginFresh({ merchantId: null });
      await prisma.staffMember.update({ where: { id: staff.id }, data: { deletedAt: new Date() } });
      await http()
        .get(`${base}/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
    });
  });

  describe('refresh rotation, replay, logout', () => {
    async function loginFresh(over: Parameters<typeof makeStaff>[0] = { merchantId: null }) {
      const { staff, email } = await makeStaff(over);
      const res = await loginBy({ email }).expect(200);
      return { staff, tokens: res.body as { accessToken: string; refreshToken: string } };
    }

    it('refreshes and rotates the refresh token', async () => {
      const { tokens } = await loginFresh();
      const res = await http()
        .post(`${base}/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('detects replay of a rotated refresh token and revokes the session', async () => {
      const { tokens } = await loginFresh();
      const rotated = await http()
        .post(`${base}/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      const r2 = rotated.body.refreshToken as string;
      await http().post(`${base}/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401); // replay r1
      await http().post(`${base}/refresh`).send({ refreshToken: r2 }).expect(401); // session revoked
    });

    it('rejects an invalid/garbage refresh token (missing session) (401)', async () => {
      await http().post(`${base}/refresh`).send({ refreshToken: 'sXXX.deadbeef' }).expect(401);
    });

    it('rejects refresh on an expired session (401)', async () => {
      const { tokens } = await loginFresh();
      const sessionId = tokens.refreshToken.split('.')[0];
      await prisma.staffSession.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().post(`${base}/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    it('blocked staff cannot refresh (403)', async () => {
      const { staff, tokens } = await loginFresh({ merchantId: null });
      await prisma.staffMember.update({ where: { id: staff.id }, data: { status: 'BLOCKED' } });
      await http().post(`${base}/refresh`).send({ refreshToken: tokens.refreshToken }).expect(403);
    });

    it('deleted staff cannot refresh (401)', async () => {
      const { staff, tokens } = await loginFresh({ merchantId: null });
      await prisma.staffMember.update({ where: { id: staff.id }, data: { deletedAt: new Date() } });
      await http().post(`${base}/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    it('logout revokes the session; refresh after logout fails; logout is idempotent', async () => {
      const { tokens } = await loginFresh();
      await http().post(`${base}/logout`).send({ refreshToken: tokens.refreshToken }).expect(204);
      await http().post(`${base}/refresh`).send({ refreshToken: tokens.refreshToken }).expect(401);
      await http().post(`${base}/logout`).send({ refreshToken: tokens.refreshToken }).expect(204); // idempotent
    });
  });

  describe('security invariants', () => {
    it('persists only a hash of the refresh secret (raw secret never stored)', async () => {
      const { email } = await makeStaff({ merchantId: null });
      const res = await loginBy({ email }).expect(200);
      const [sessionId, rawSecret] = (res.body.refreshToken as string).split('.');
      const session = await prisma.staffSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session.refreshTokenHash).not.toBe(rawSecret);
      expect(session.refreshTokenHash).not.toContain(rawSecret);
    });

    it('stores a bcrypt hash for the credential and verifies it (never plaintext)', async () => {
      const m = await makeMerchant();
      const { staff, email } = await makeStaff({ merchantId: m.id });
      const cred = await prisma.staffCredential.findFirstOrThrow({
        where: { staffMemberId: staff.id, type: 'PASSWORD' },
      });
      expect(cred.secretHash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
      expect(cred.secretHash).not.toContain(PASSWORD);
      await loginBy({ email }).expect(200); // bcrypt verification works end-to-end
    });
  });
});
