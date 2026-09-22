import { env } from '../../config/env.js';
import { AuthenticationError, NotFoundError } from '../../errors/index.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../../lib/cookies.js';
import { signAccessToken } from '../../lib/jwt.js';
import { respond } from '../../lib/response.js';
import { findUserById, toPublicUser } from '../users/service.js';
import * as authService from './service.js';
import type {
  ActivateInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
} from './schema.js';

// POST /auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as LoginInput;
  const { user, session } = await authService.login(email, password);

  setRefreshCookie(res, session.token, session.expiresAt);

  const publicUser = toPublicUser(user);
  respond(res, 200, {
    accessToken: signAccessToken(publicUser),
    expiresIn: env.ACCESS_TOKEN_TTL,
    user: publicUser,
  });
});

// POST /auth/refresh
export const refresh = asyncHandler(async (req, res) => {
  const token = getRefreshCookie(req);
  if (!token) {
    throw new AuthenticationError('Refresh token is missing');
  }

  const rotated = await authService.rotateSession(token);
  setRefreshCookie(res, rotated.token, rotated.expiresAt);

  const user = toPublicUser(rotated.user);
  respond(res, 200, {
    accessToken: signAccessToken(user),
    expiresIn: env.ACCESS_TOKEN_TTL,
    user,
  });
});

// POST /auth/logout
export const logout = asyncHandler(async (req, res) => {
  const token = getRefreshCookie(req);
  if (token) {
    await authService.revokeSession(token);
  }

  clearRefreshCookie(res);
  respond(res, 200, { loggedOut: true });
});

// GET /auth/me
export const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AuthenticationError();
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    throw new NotFoundError('User');
  }

  respond(res, 200, { user: toPublicUser(user) });
});

// POST /auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as ForgotPasswordInput;
  const { token } = await authService.requestPasswordReset(email);

  const data: Record<string, unknown> = {
    message: 'If an account exists for that email, a password reset link has been sent.',
  };
  // No mailer is wired up yet: expose the token outside production so the
  // flow can be exercised end-to-end.
  if (env.NODE_ENV !== 'production' && token) {
    data.devToken = token;
  }
  respond(res, 200, data);
});

// POST /auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body as ResetPasswordInput;
  await authService.resetPassword(token, password);

  respond(res, 200, {
    message: 'Password has been reset. Please sign in with your new password.',
  });
});

// POST /auth/activate — INVITED → ACTIVE
export const activate = asyncHandler(async (req, res) => {
  const { token, password } = req.body as ActivateInput;
  const row = await authService.activateAccount(token, password);

  respond(res, 200, {
    message: 'Account activated. You can now sign in.',
    user: toPublicUser(row),
  });
});

// GET /auth/invitation/:token — read-only preview; always 200 with a status
export const previewInvitation = asyncHandler(async (req, res) => {
  const { token } = req.params as { token: string };
  const preview = await authService.previewInvitation(token);
  respond(res, 200, preview);
});

