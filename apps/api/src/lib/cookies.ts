import { Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Refresh token cookie:
 * - HTTP-only  → never readable from JavaScript (access token stays in memory)
 * - SameSite=Lax → sent on same-site XHR, blocked on cross-site requests
 * - path-scoped to the auth endpoints so it is not sent with regular API calls
 * - Secure when COOKIE_SECURE=true (HTTPS deployments)
 */
export const REFRESH_COOKIE_NAME = 'tt_refresh';
const COOKIE_PATH = '/api/v1/auth';

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
    expires,
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions(expiresAt));
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

export function getRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
