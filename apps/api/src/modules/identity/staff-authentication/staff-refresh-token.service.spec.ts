import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaffRefreshTokenService } from './staff-refresh-token.service';
import { StaffSessionRecord, StaffSessionRepository } from './staff-session.repository';

/** In-memory staff session store (synthetic; no DB). */
class FakeStaffSessions extends StaffSessionRepository {
  private store = new Map<string, StaffSessionRecord>();
  private seq = 0;
  constructor() {
    super(null as never);
  }
  async create(staffMemberId: string, refreshTokenHash: string, expiresAt: Date) {
    const rec = { id: `s${++this.seq}`, staffMemberId, refreshTokenHash, expiresAt };
    this.store.set(rec.id, rec);
    return rec;
  }
  async findById(id: string) {
    return this.store.get(id) ?? null;
  }
  async rotate(id: string, refreshTokenHash: string, expiresAt: Date) {
    const rec = { ...this.store.get(id)!, refreshTokenHash, expiresAt };
    this.store.set(id, rec);
    return rec;
  }
  async revoke(id: string) {
    this.store.delete(id);
  }
  has(id: string) {
    return this.store.has(id);
  }
}

const config = {
  get: (k: string) => (k === 'STAFF_REFRESH_TTL_DAYS' ? 30 : undefined),
} as ConfigService;

describe('StaffRefreshTokenService', () => {
  let sessions: FakeStaffSessions;
  let svc: StaffRefreshTokenService;

  beforeEach(() => {
    sessions = new FakeStaffSessions();
    svc = new StaffRefreshTokenService(sessions, config);
  });

  it('issues a token of form <sessionId>.<secret> and persists only a hash', async () => {
    const issued = await svc.issue('staff1');
    expect(issued.token).toMatch(/^s\d+\.[0-9a-f]{64}$/);
    const rec = await sessions.findById(issued.sessionId);
    const rawSecret = issued.token.split('.')[1];
    expect(rec!.refreshTokenHash).not.toBe(rawSecret); // stored hash != raw secret
    expect(rec!.refreshTokenHash).not.toContain(rawSecret);
  });

  it('rotates: new token differs; replay of old token revokes the session', async () => {
    const first = await svc.issue('staff1');
    const rotated = await svc.rotate(first.token);
    expect(rotated.staffMemberId).toBe('staff1');
    expect(rotated.refresh.token).not.toBe(first.token);
    // replay the old token -> reuse detected -> session revoked
    await expect(svc.rotate(first.token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.has(first.sessionId)).toBe(false);
    // the rotated token is now also invalid (session gone)
    await expect(svc.rotate(rotated.refresh.token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed token', async () => {
    await expect(svc.rotate('not-a-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown/revoked (missing) session', async () => {
    await expect(svc.rotate('s999.deadbeef')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects and revokes an expired session', async () => {
    const issued = await svc.issue('staff1');
    await sessions.rotate(
      issued.sessionId,
      (await sessions.findById(issued.sessionId))!.refreshTokenHash,
      new Date(Date.now() - 1000),
    );
    await expect(svc.rotate(issued.token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.has(issued.sessionId)).toBe(false);
  });

  it('revoke() removes the session (idempotent)', async () => {
    const issued = await svc.issue('staff1');
    await svc.revoke(issued.token);
    expect(sessions.has(issued.sessionId)).toBe(false);
    await expect(svc.revoke(issued.token)).resolves.toBeUndefined(); // idempotent
    await expect(svc.revoke('garbage')).resolves.toBeUndefined();
  });
});
