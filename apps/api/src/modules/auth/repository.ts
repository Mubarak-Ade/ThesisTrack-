import { and, eq, isNull, lt } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { accountTokens, sessions } from '../../schema/index.js';
import type { AccountTokenType } from './types.js';

// ── Sessions (table: sessions) ────────────────────────────────────────

export async function insertSession(values: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<{ id: string; expiresAt: Date }> {
  const [row] = await db
    .insert(sessions)
    .values(values)
    .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
  return row;
}

export async function findSessionByTokenHash(tokenHash: string) {
  return db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
    with: { user: true },
  });
}

export async function revokeSessionIfActive(sessionId: string): Promise<boolean> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

export async function revokeSessionByHashIfActive(tokenHash: string): Promise<boolean> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// ── Account tokens (table: account_tokens) ────────────────────────────

/**
 * Optional executor lets callers run these inside a transaction (the bulk
 * import inserts users + activation tokens atomically).
 */
export type TokenExecutor = Pick<typeof db, 'insert' | 'delete'>;

export async function deleteAccountTokens(
  userId: string,
  type: AccountTokenType,
  executor: TokenExecutor = db,
): Promise<void> {
  await executor
    .delete(accountTokens)
    .where(and(eq(accountTokens.userId, userId), eq(accountTokens.type, type)));
}

export async function insertAccountToken(
  values: {
    userId: string;
    type: AccountTokenType;
    tokenHash: string;
    expiresAt: Date;
  },
  executor: TokenExecutor = db,
): Promise<void> {
  await executor.insert(accountTokens).values(values);
}

export async function findAccountTokenByHash(tokenHash: string) {
  return db.query.accountTokens.findFirst({ where: eq(accountTokens.tokenHash, tokenHash) });
}

/**
 * Invitation preview lookup: activation tokens only, joined to the user row.
 * Read-only — the token is never consumed here. Non-activation tokens are
 * filtered out at the query level, so they are indistinguishable from
 * unknown tokens (no payload can leak for a password_reset token).
 */
export async function findInvitationByTokenHash(tokenHash: string) {
  return db.query.accountTokens.findFirst({
    where: and(eq(accountTokens.tokenHash, tokenHash), eq(accountTokens.type, 'activation')),
    with: { user: true },
  });
}

export async function consumeAccountTokenIfUnused(tokenId: string): Promise<boolean> {
  const rows = await db
    .update(accountTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(accountTokens.id, tokenId), isNull(accountTokens.usedAt)))
    .returning({ id: accountTokens.id });
  return rows.length > 0;
}
