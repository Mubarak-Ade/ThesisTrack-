import { env } from '../config/env.js';

/**
 * Account-lifecycle deep links built from `env.WEB_ORIGIN` (mailer design §4).
 *
 * The SPA reads the token from the **query string** on both flows — verified
 * against the frontend:
 *   - `/invite?token=`   → `InviteTokenGuard.tsx` uses `params.get('token')`
 *   - `/reset-password?token=` → `ResetPassword.tsx` uses `params.get('token')`
 *
 * The token is `encodeURIComponent`-ed: it is base64url (generateToken), but
 * urlencoding keeps the contract correct if the encoding ever changes.
 */

/** Admin invitation → set-password screen. */
export function buildInviteLink(token: string): string {
  return `${env.WEB_ORIGIN}/invite?token=${encodeURIComponent(token)}`;
}

/** Forgot-password → reset-password screen. */
export function buildResetLink(token: string): string {
  return `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
}
