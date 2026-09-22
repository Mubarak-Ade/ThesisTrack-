import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../../lib/cookies.js';
import { signAccessToken } from '../../lib/jwt.js';
import { AuthenticationError, NotFoundError } from '../../errors/index.js';
import { validate } from '../../middleware/validate.js';
import {
  activateSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '../../validators/auth.js';
import { hashPassword, verifyPassword } from '../../services/password.js';
import {
  createSession,
  purgeExpiredSessions,
  revokeSession,
  rotateSession,
} from '../../services/sessions.js';
import {
  activateAccount,
  findUserByEmail,
  findUserById,
  resetPassword,
  toPublicUser,
} from '../../services/users.js';
import { issueAccountToken } from '../../services/account-tokens.js';

const router = Router();

/**
 * Equalizes response time for unknown emails vs. wrong passwords
 * (prevents account enumeration through timing).
 */
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

/**
 * POST /auth/login
 * verify credentials → create session → access token + refresh cookie
 * The access token goes to client memory; the refresh token is HTTP-only.
 */
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const user = await findUserByEmail(email);
    const storedHash = user?.passwordHash ?? (await getDummyHash());
    const passwordOk = await verifyPassword(password, storedHash);

    if (!user || !passwordOk) {
      throw new AuthenticationError('Invalid email or password');
    }
    if (!user.isActive) {
      throw new AuthenticationError('Account is not active. Contact your administrator.');
    }

    await purgeExpiredSessions(); // opportunistic cleanup of expired sessions

    const session = await createSession(user.id);
    setRefreshCookie(res, session.token, session.expiresAt);

    const publicUser = toPublicUser(user);
    respond(res, 200, {
      accessToken: signAccessToken(publicUser),
      expiresIn: env.ACCESS_TOKEN_TTL,
      user: publicUser,
    });
  }),
);

/**
 * POST /auth/refresh
 * Cookie → SHA-256 → session row (exists, not revoked, not expired) →
 * revoke it (rotation) → issue a new session + a new access token.
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = getRefreshCookie(req);
    if (!token) {
      throw new AuthenticationError('Refresh token is missing');
    }

    const rotated = await rotateSession(token);
    setRefreshCookie(res, rotated.token, rotated.expiresAt);

    const user = toPublicUser(rotated.user);
    respond(res, 200, {
      accessToken: signAccessToken(user),
      expiresIn: env.ACCESS_TOKEN_TTL,
      user,
    });
  }),
);

/**
 * POST /auth/logout
 * Revokes the session server-side and clears the cookie. Idempotent.
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = getRefreshCookie(req);
    if (token) {
      await revokeSession(token);
    }
    clearRefreshCookie(res);
    respond(res, 200, { loggedOut: true });
  }),
);

/**
 * GET /auth/me
 * The protected-endpoint probe: requires a valid access token.
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw new AuthenticationError();
    }

    const user = await findUserById(req.user.id);
    if (!user) {
      throw new NotFoundError('User');
    }

    respond(res, 200, { user: toPublicUser(user) });
  }),
);

/**
 * POST /auth/forgot-password
 * Always answers 200 with the same message (no account enumeration).
 * The token is single-use, hashed, and expires with RESET_TOKEN_TTL.
 */
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };

    const user = await findUserByEmail(email);
    let devToken: string | undefined;

    if (user?.isActive && user.passwordHash) {
      const issued = await issueAccountToken(user.id, 'password_reset');
      devToken = issued.token;
      // Production: email `issued.token` to the user.
      console.log(
        `[password-reset] token for ${user.email}: ${issued.token} (expires ${issued.expiresAt.toISOString()})`,
      );
    }

    const data: Record<string, unknown> = {
      message: 'If an account exists for that email, a password reset link has been sent.',
    };
    // No mailer is wired up yet: expose the token outside production so the
    // flow can be exercised end-to-end.
    if (env.NODE_ENV !== 'production' && devToken) {
      data.devToken = devToken;
    }

    respond(res, 200, data);
  }),
);

/**
 * POST /auth/reset-password
 * Consumes the token, sets the new password, revokes every session.
 */
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };

    await resetPassword(token, password);

    respond(res, 200, {
      message: 'Password has been reset. Please sign in with your new password.',
    });
  }),
);

/**
 * POST /auth/activate
 * INVITED → ACTIVE: consumes the invitation token, sets the initial password.
 */
router.post(
  '/activate',
  validate(activateSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };

    const user = await activateAccount(token, password);

    respond(res, 200, {
      message: 'Account activated. You can now sign in.',
      user,
    });
  }),
);

export default router;
