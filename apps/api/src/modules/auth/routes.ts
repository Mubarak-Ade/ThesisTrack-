import { Router } from 'express';

import { forgotPasswordLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  activateSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './schema.js';

const router = Router();

router.post('/login', validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', controller.me);
// Rate-limited (§9/G4): the only unauthenticated mail-sending route. The
// limiter runs BEFORE validation so even malformed floods are throttled.
router.post(
  '/forgot-password',
  ...forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword,
);
// Rate-limited (§9/G4): the forgotten-invitation twin of forgot-password.
// It shares the SAME per-IP/per-email budget on purpose — both routes mail a
// one-time secret to one address, so one abuse window covers both. The
// email-only body reuses forgotPasswordSchema. Limiter before validation.
router.post(
  '/resend-invitation',
  ...forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  controller.resendInvitation,
);
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);
router.post('/activate', validate(activateSchema), controller.activate);
// Public (allowlisted in middleware/auth.ts); read-only preview, never consumes the token
router.get('/invitation/:token', controller.previewInvitation);

export default router;
