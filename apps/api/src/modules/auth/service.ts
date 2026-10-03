import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

import { env } from '../../config/env.js';
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from '../../errors/index.js';
import { generateToken, hashToken } from '../../lib/tokens.js';
import { purgeExpiredIdempotencyKeys } from '../../middleware/idempotency.js';
// Cross-module calls go through users/service.ts (ADR-02), never its repository.
// This completes an auth ↔ users cycle; both sides call into each other from
// inside function bodies and all involved exports are hoisted declarations, so
// module evaluation order is irrelevant.
import { findUserByEmail as findUserByEmailRow, updateUserPassword } from '../users/service.js';
import type { UserRow } from '../users/types.js';
import {
  consumeAccountTokenIfUnused,
  deleteAccountTokens,
  deleteExpiredSessions,
  findAccountTokenByHash,
  findInvitationByTokenHash,
  findSessionByTokenHash,
  insertAccountToken,
  insertSession,
  revokeAllSessionsForUser,
  revokeSessionByHashIfActive,
  revokeSessionIfActive,
  type TokenExecutor,
} from './repository.js';
import type {
  AccountTokenType,
  InvitationPreview,
  InvitationPreviewUser,
  IssuedAccountToken,
  IssuedSession,
  PasswordResetRequest,
  RotatedSession,
} from './types.js';

const BCRYPT_ROUNDS = 12;

// ── Password hashing ──────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Equalizes response time for unknown emails vs. wrong passwords
 * (prevents account enumeration through timing).
 */
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

// ── Login ─────────────────────────────────────────────────────────────

/**
 * verify credentials → create session.
 * The caller (controller) issues the access token and sets the refresh cookie.
 */
export async function login(
  email: string,
  password: string,
): Promise<{ user: UserRow; session: IssuedSession }> {
  const user = await findUserByEmailRow(email);

  const storedHash = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(password, storedHash);

  if (!user || !passwordOk) {
    throw new AuthenticationError('Invalid email or password');
  }
  if (!user.isActive) {
    throw new AuthenticationError('Account is not active. Contact your administrator.');
  }

  await purgeExpiredSessions(); // opportunistic cleanup of expired sessions
  // §11.12's `expires_at` sweep rides along (plan 8.3 — no new scheduler).
  await purgeExpiredIdempotencyKeys();

  const session = await createSession(user.id);
  return { user, session };
}

// ── Session lifecycle ─────────────────────────────────────────────────

/**
 * Creates a session for a fresh login. Returns the *raw* refresh token —
 * only its SHA-256 hash is stored, so a database leak cannot be replayed.
 */
export async function createSession(userId: string): Promise<IssuedSession> {
  const token = generateToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);

  const row = await insertSession({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, sessionId: row.id, expiresAt: row.expiresAt };
}

/**
 * Validates a raw refresh token against the sessions table:
 * must exist, not be revoked, not be expired, and belong to an active user.
 */
export async function resolveSession(token: string): Promise<{ sessionId: string; user: UserRow }> {
  const row = await findSessionByTokenHash(hashToken(token));

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

  const revoked = await revokeSessionIfActive(sessionId);
  if (!revoked) {
    throw new AuthenticationError('Refresh token has already been used');
  }

  const issued = await createSession(user.id);
  return { user, ...issued };
}

/** Idempotent: unknown or already-revoked tokens are ignored. */
export async function revokeSession(token: string): Promise<boolean> {
  return revokeSessionByHashIfActive(hashToken(token));
}

/** Used on password reset — logs the user out of every device. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await revokeAllSessionsForUser(userId);
}

/** Opportunistic cleanup of expired sessions (called on login). */
export async function purgeExpiredSessions(): Promise<void> {
  await deleteExpiredSessions();
}

// ── Account tokens (single-use, hashed at rest) ───────────────────────

const TTL_SECONDS: Record<AccountTokenType, number> = {
  activation: env.ACTIVATION_TOKEN_TTL,
  password_reset: env.RESET_TOKEN_TTL,
};

/**
 * Issues a single-use, hashed account token. Any outstanding token of the
 * same type for that user is invalidated first (latest invitation wins).
 * Pass an executor to run inside the caller's transaction (bulk import).
 */
async function issueAccountToken(
  userId: string,
  type: AccountTokenType,
  executor?: TokenExecutor,
): Promise<IssuedAccountToken> {
  await deleteAccountTokens(userId, type, executor);

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + TTL_SECONDS[type] * 1000);

  await insertAccountToken({ userId, type, tokenHash: hashToken(token), expiresAt }, executor);

  return { token, expiresAt };
}

export function issueActivationToken(userId: string, executor?: TokenExecutor): Promise<IssuedAccountToken> {
  return issueAccountToken(userId, 'activation', executor);
}

export function issueResetToken(userId: string): Promise<IssuedAccountToken> {
  return issueAccountToken(userId, 'password_reset');
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
  const row = await findAccountTokenByHash(hashToken(token));

  const invalid = new ValidationError('Invalid or expired token');

  if (!row || row.type !== type || row.usedAt !== null || row.expiresAt.getTime() <= Date.now()) {
    throw invalid;
  }

  const consumed = await consumeAccountTokenIfUnused(row.id);
  if (!consumed) {
    throw invalid;
  }

  return { userId: row.userId };
}

// ── Account lifecycle flows ───────────────────────────────────────────

/** INVITED → ACTIVE: consumes the activation token and sets the password. */
export async function activateAccount(token: string, password: string): Promise<UserRow> {
  const { userId } = await consumeAccountToken(token, 'activation');
  const passwordHash = await hashPassword(password);

  const updated = await updateUserPassword(userId, passwordHash, { activate: true });
  if (!updated) {
    throw new NotFoundError('User');
  }

  return updated;
}

/**
 * Consumes the reset token, sets the new password, and revokes every
 * session for that user (they must sign in again everywhere).
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  const { userId } = await consumeAccountToken(token, 'password_reset');
  const passwordHash = await hashPassword(password);

  const updated = await updateUserPassword(userId, passwordHash);
  if (!updated) {
    throw new NotFoundError('User');
  }

  await revokeAllSessionsForUser(userId);
}

/**
 * Always answers the same way upstream (no account enumeration): returns a
 * token only when the account is active and has a password set.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetRequest> {
  const user = await findUserByEmailRow(email);

  if (!user?.isActive || !user.passwordHash) {
    return {};
  }

  const issued = await issueAccountToken(user.id, 'password_reset');

  // Production: email `issued.token` to the user.
  console.log(
    `[password-reset] token for ${user.email}: ${issued.token} (expires ${issued.expiresAt.toISOString()})`,
  );

  return { token: issued.token };
}

// ── Invitation preview ────────────────────────────────────────────────

/**
 * Read-only preview of an invitation link — never consumes the token.
 * Always resolves (HTTP 200); the caller routes on `status`:
 *
 *   already_activated  token used, or the user is already ACTIVE
 *   invalid            unknown, expired, or a non-activation token
 *   valid              unused, unexpired activation token
 *
 * Order matters: a consumed activation token reports `already_activated`
 * even if it has since expired — that is the truthful, actionable state.
 */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const row = await findInvitationByTokenHash(hashToken(token));
  const user = row?.user;

  if (!row || !user) {
    return { status: 'invalid', invitation: null };
  }

  const invitation: InvitationPreviewUser = {
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    role: user.role,
    registrationNumber: user.registrationNumber,
  };

  if (row.usedAt !== null || user.isActive) {
    return { status: 'already_activated', invitation };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { status: 'invalid', invitation: null };
  }

  return { status: 'valid', invitation };
}
