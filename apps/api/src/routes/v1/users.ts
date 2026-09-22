import { Router } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import { requireAdmin } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import { createUserSchema } from '../../validators/users.js';
import { provisionUser, toPublicUser } from '../../services/users.js';

const router = Router();

/**
 * POST /users — account provisioning (admin only, no public registration):
 *
 *   admin creates user → INVITED → invitation → user activates → ACTIVE
 *
 * Returns the invitation token directly. There is no mailer yet; in
 * production this token would be emailed to the invited user instead.
 */
router.post(
  '/users',
  requireAdmin(),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const { user, activationToken, activationExpiresAt, reinvited } = await provisionUser(
      req.body as Parameters<typeof provisionUser>[0],
    );

    const publicUser = toPublicUser(user);
    console.log(
      `[invitation] ${publicUser.email} activation token: ${activationToken} (expires ${activationExpiresAt.toISOString()})`,
    );

    const data: Record<string, unknown> = {
      user: publicUser,
      status: publicUser.isActive ? 'ACTIVE' : 'INVITED',
      activationExpiresAt,
      reinvited,
    };

    if (env.NODE_ENV !== 'production') {
      data.activationToken = activationToken;
    }

    respond(res, reinvited ? 200 : 201, data);
  }),
);

export default router;
