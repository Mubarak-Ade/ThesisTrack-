import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { ValidationError } from '../errors/index.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { accountTokens } from '../schema/index.js';

export type AccountTokenType = 'activation' | 'password_reset';

const TTL_SECONDS: Record<AccountTokenType, number> = {
  activation: env.ACTIVATION_TOKEN_TTL,
  password_reset: env.RESET_TOKEN_TTL,
};

export interface IssuedAccountToken {
  token: string;
  expiresAt: Date;
}

/**
 * Issues a single-use, hashed account token. Any outstanding token of the
 * same type for that user is invalidated first (latest invitation wins).
 */
export async function issueAccountToken(
  userId: string,
  type: AccountTokenType,
): Promise<IssuedAccountToken> {
  await db
    .delete(accountTokens)
    .where(and(eq(accountTokens.userId, userId), eq(accountTokens.type, type)));

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + TTL_SECONDS[type] * 1000);

  await db
    .insert(accountTokens)
    .values({ userId, type, tokenHash: hashToken(token), expiresAt });

  return { token, expiresAt };
}

/**
 * Consumes an account token: must exist, match the expected type, be unused,
 * and be unexpired. Single-use is enforced atomically (UPDATE … WHERE used_at
 * IS NULL), so two racing requests cannot both succeed.
 */
export async function consumeAccountToken(
  token: string,
  type: AccountTokenType,
): Promise<{ userId: string }> {
  const row = await db.query.accountTokens.findFirst({
    where: eq(accountTokens.tokenHash, hashToken(token)),
  });

  const invalid = new ValidationError('Invalid or expired token');

  if (!row || row.type !== type || row.usedAt !== null || row.expiresAt.getTime() <= Date.now()) {
    throw invalid;
  }

  const consumed = await db
    .update(accountTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(accountTokens.id, row.id), isNull(accountTokens.usedAt)))
    .returning({ id: accountTokens.id });

  if (consumed.length === 0) {
    throw invalid;
  }

  return { userId: row.userId };
}
