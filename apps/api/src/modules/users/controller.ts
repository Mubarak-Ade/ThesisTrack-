import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type { CreateUserInput } from './schema.js';
import { provisionUser, toPublicUser } from './service.js';

// POST /users — account provisioning (admin only, no public registration):
//   admin creates user → INVITED → invitation → user activates → ACTIVE
export const create = asyncHandler(async (req, res) => {
  const { user, activationToken, activationExpiresAt, reinvited } = await provisionUser(
    req.body as CreateUserInput,
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

  // No mailer yet: outside production the token is returned directly so the
  // activation flow can be exercised end-to-end.
  if (env.NODE_ENV !== 'production') {
    data.activationToken = activationToken;
  }

  respond(res, reinvited ? 200 : 201, data);
});
