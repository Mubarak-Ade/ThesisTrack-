import { Router } from 'express';

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
router.post('/forgot-password', validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);
router.post('/activate', validate(activateSchema), controller.activate);
// Public (allowlisted in middleware/auth.ts); read-only preview, never consumes the token
router.get('/invitation/:token', controller.previewInvitation);

export default router;
