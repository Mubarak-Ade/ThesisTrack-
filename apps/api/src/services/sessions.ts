import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { AuthenticationError } from '../errors/index.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { sessions } from '../schema/index.js';
import type { UserRow } from './users.js';

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface RotatedSession extends IssuedSession {
  user: UserRow;
}

/**
 * Creates a session for a fresh login. Returns the *raw* refresh token —
 * only its SHA-256 hash is stored, so a database leak cannot be replayed.
 */
export async function createSession(userId: string): Promise<IssuedSession> {
  const token = generateToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);

  const [row] = await db
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt })
    .returning({ id: sessions.id, expiresAt: sessions.expiresAt });

  return { token, sessionId: row.id, expiresAt: row.expiresAt };
}

/**
 * Validates a raw refresh token against the sessions table:
 * must exist, not be revoked, not be expired, and belong to an active user.
 */
export async function resolveSession(token: string): Promise<{ sessionId: string; user: UserRow }> {
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashToken(token)),
    with: { user: true },
  });

  if (!row || !row.user) {
    throw new AuthenticationError('Refresh token is invalid');
  }
  if (row.revokedAt !== null) {
    throw new AuthenticationError('Refresh token has been revoked');
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new AuthenticationError('Refresh token has expired');
  }
  if (!row.user.isActive || !row.user.passwordHash) {
    throw new AuthenticationError('Account is not active');
  }

  return { sessionId: row.id, user: row.user };
}

/**
 * Refresh rotation: the presented token is revoked (single-use — only the
 * first request with a given token succeeds) and a brand-new session/token
 * pair is issued.
 */
export async function rotateSession(token: string): Promise<RotatedSession> {
  const { sessionId, user } = await resolveSession(token);

  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  if (revoked.length === 0) {
    throw new AuthenticationError('Refresh token has already been used');
  }

  const issued = await createSession(user.id);
  return { user, ...issued };
}

/** Idempotent: unknown or already-revoked tokens are ignored. */
export async function revokeSession(token: string): Promise<boolean> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  return revoked.length > 0;
}

/** Used on password reset — logs the user out of every device. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Opportunistic cleanup of expired sessions (called on login). */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
