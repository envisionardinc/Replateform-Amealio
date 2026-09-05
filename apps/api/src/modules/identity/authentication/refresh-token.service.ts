import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SessionRepository } from './session.repository';

export interface IssuedRefresh {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Rotating, revocable refresh tokens backed by server-side sessions (P1.7.1B).
 *
 * Token format: `<sessionId>.<rawSecret>` (rawSecret = 32 random bytes, hex).
 * Server stores ONLY sha256(rawSecret) in Session.refreshTokenHash (never plaintext).
 * Rotation replaces the stored hash + sliding expiry. Presenting an old (already
 * rotated) secret for an existing session is REPLAY -> revoke the session + reject.
 */
@Injectable()
export class RefreshTokenService {
  private readonly ttlDays: number;

  constructor(
    private readonly sessions: SessionRepository,
    config: ConfigService,
  ) {
    this.ttlDays = config.get<number>('REFRESH_TTL_DAYS') ?? 30;
  }

  private hash(rawSecret: string): string {
    return createHash('sha256').update(rawSecret).digest('hex');
  }

  private newExpiry(): Date {
    return new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);
  }

  private static safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }

  private parse(token: string): { sessionId: string; rawSecret: string } | null {
    const idx = token.indexOf('.');
    if (idx <= 0 || idx === token.length - 1) return null;
    return { sessionId: token.slice(0, idx), rawSecret: token.slice(idx + 1) };
  }

  async issue(userId: string): Promise<IssuedRefresh> {
    const rawSecret = randomBytes(32).toString('hex');
    const expiresAt = this.newExpiry();
    const session = await this.sessions.create(userId, this.hash(rawSecret), expiresAt);
    return { token: `${session.id}.${rawSecret}`, sessionId: session.id, expiresAt };
  }

  /**
   * Validate + rotate. Returns the userId + a new refresh token, or throws
   * UnauthorizedException on invalid/expired/revoked/replayed tokens.
   */
  async rotate(token: string): Promise<{ userId: string; refresh: IssuedRefresh }> {
    const parsed = this.parse(token);
    if (!parsed) throw new UnauthorizedException('Invalid refresh token');

    const session = await this.sessions.findById(parsed.sessionId);
    if (!session) throw new UnauthorizedException('Session revoked or not found');

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.revoke(session.id);
      throw new UnauthorizedException('Session expired');
    }

    const presentedHash = this.hash(parsed.rawSecret);
    if (!RefreshTokenService.safeEqual(presentedHash, session.refreshTokenHash)) {
      // A valid session but a non-current secret => replay of a rotated token.
      await this.sessions.revoke(session.id);
      throw new UnauthorizedException('Refresh token reuse detected; session revoked');
    }

    const rawSecret = randomBytes(32).toString('hex');
    const expiresAt = this.newExpiry();
    await this.sessions.rotate(session.id, this.hash(rawSecret), expiresAt);
    return {
      userId: session.userId,
      refresh: { token: `${session.id}.${rawSecret}`, sessionId: session.id, expiresAt },
    };
  }

  /** Revoke the session referenced by a refresh token (idempotent). */
  async revoke(token: string): Promise<void> {
    const parsed = this.parse(token);
    if (!parsed) return; // nothing to revoke; do not leak info
    await this.sessions.revoke(parsed.sessionId);
  }
}
