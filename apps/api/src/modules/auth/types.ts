import type { UserRow } from '../users/types.js';

export type AccountTokenType = 'activation' | 'password_reset';

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface RotatedSession extends IssuedSession {
  user: UserRow;
}

export interface IssuedAccountToken {
  token: string;
  expiresAt: Date;
}

export interface PasswordResetRequest {
  token?: string;
}

/** Server-side name derivation — the users table stores names split. */
export interface InvitationPreviewUser {
  name: string;
  email: string;
  role: UserRow['role'];
  registrationNumber: string | null;
}

/**
 * GET /auth/invitation/:token discriminator. Always HTTP 200; the frontend
 * routes on `status` alone.
 * - valid:             unused, unexpired activation token → payload present
 * - already_activated: token used, or user already ACTIVE → payload present
 * - invalid:           unknown, expired, or non-activation token → null
 */
export type InvitationPreview =
  | { status: 'valid'; invitation: InvitationPreviewUser }
  | { status: 'already_activated'; invitation: InvitationPreviewUser | null }
  | { status: 'invalid'; invitation: null };
