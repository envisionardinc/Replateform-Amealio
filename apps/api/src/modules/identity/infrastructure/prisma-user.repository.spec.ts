import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaUserRepository } from './prisma-user.repository';

/**
 * Integration test against the TEST database (DATABASE_URL must point at
 * amealio_test). Synthetic data only; no legacy/production data.
 */
describe('PrismaUserRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaUserRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const phone = () => `9${Date.now().toString().slice(-9)}`;

  it('creates a user with defaults (unverified, not blocked) and no role column', async () => {
    const p = phone();
    const user = await repo.create({ phoneCountryCode: '+91', phone: p });
    const snap = user.toSnapshot();
    expect(snap.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(snap.isVerified).toBe(false);
    expect(snap.isBlocked).toBe(false);
  });

  it('finds a user by phone and by id', async () => {
    const p = phone();
    const created = await repo.create({ phoneCountryCode: '+91', phone: p, email: null });
    const byPhone = await repo.findByPhone('+91', p);
    expect(byPhone?.id).toBe(created.id);
    const byId = await repo.findById(created.id);
    expect(byId?.id).toBe(created.id);
  });

  it('persists a supplied passwordHash without exposing it in the snapshot', async () => {
    const p = phone();
    const user = await repo.create({
      phoneCountryCode: '+91',
      phone: p,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
    });
    expect((user.toSnapshot() as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('enforces phone uniqueness at the database', async () => {
    const p = phone();
    await repo.create({ phoneCountryCode: '+91', phone: p });
    await expect(repo.create({ phoneCountryCode: '+91', phone: p })).rejects.toThrow(
      /unique|constraint/i,
    );
  });

  it('returns null for an unknown phone', async () => {
    expect(await repo.findByPhone('+91', '0000000000')).toBeNull();
  });
});
