import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token (used for refresh, activation, and reset tokens). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hash — only hashes of tokens are ever persisted. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
