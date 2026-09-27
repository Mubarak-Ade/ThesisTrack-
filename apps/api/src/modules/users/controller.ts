import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import {
  getUser,
  importUsers as importUsersRows,
  listUsers,
  provisionUser,
  resendInvitation,
  toPublicUser,
  updateUser,
} from './service.js';
import type {
  CreateUserInput,
  ImportUsersInput,
  ListUsersQuery,
  UpdateUserInput,
  UserIdParams,
} from './schema.js';

// POST /users — account provisioning (admin only, no public registration):
//   admin creates user → INVITED → invitation → user activates → ACTIVE
export const create = asyncHandler(async (req, res) => {
    const { user, activationToken, activationExpiresAt, reinvited } = await provisionUser(
        req.body as CreateUserInput
    );

    const publicUser = toPublicUser(user);
    console.log(
        `[invitation] ${publicUser.email} activation token: ${activationToken} (expires ${activationExpiresAt.toISOString()})`
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

// GET /users — admin directory: search (q), filters (role, isActive), paging.
export const list = asyncHandler(async (req, res) => {
    const query = req.query as unknown as ListUsersQuery;
    const { users, total } = await listUsers(query);

    respond(res, 200, {
        users,
        pagination: { page: query.page, limit: query.limit, total },
    });
});

// GET /users/:userId — single account (public shape, never passwordHash).
export const detail = asyncHandler(async (req, res) => {
    const { userId } = req.params as UserIdParams;
    const user = await getUser(userId);
    respond(res, 200, { user: toPublicUser(user) });
});

// PATCH /users/:userId — profile edits, role changes, activate/deactivate.
export const update = asyncHandler(async (req, res) => {
    const { userId } = req.params as UserIdParams;
    const updated = await updateUser(userId, req.body as UpdateUserInput, req.user!.id);
    respond(res, 200, { user: toPublicUser(updated) });
});

// POST /users/:userId/invite — resend the invitation (fresh token, latest wins).
export const invite = asyncHandler(async (req, res) => {
    const { userId } = req.params as UserIdParams;
    const { user, activationToken, activationExpiresAt } = await resendInvitation(userId);

    const publicUser = toPublicUser(user);
    console.log(
        `[invitation] ${publicUser.email} activation token: ${activationToken} (expires ${activationExpiresAt.toISOString()})`
    );

    const data: Record<string, unknown> = {
        user: publicUser,
        status: publicUser.status,
        activationExpiresAt,
    };

    if (env.NODE_ENV !== 'production') {
        data.activationToken = activationToken;
    }

    respond(res, 200, data);
});

// POST /users/import — bulk provisioning; all-or-nothing (422 lists every
// bad row, a transaction guarantees no partial import).
export const importUsers = asyncHandler(async (req, res) => {
    const { users, invitations } = await importUsersRows(req.body as ImportUsersInput);

    for (const invitation of invitations) {
        console.log(
            `[invitation] ${invitation.email} activation token: ${invitation.activationToken} (expires ${invitation.activationExpiresAt.toISOString()})`
        );
    }

    const data: Record<string, unknown> = {
        created: users.length,
        users: users.map(toPublicUser),
    };

    if (env.NODE_ENV !== 'production') {
        data.invitations = invitations.map(({ email, activationToken, activationExpiresAt }) => ({
            email,
            activationToken,
            activationExpiresAt,
        }));
    }

    respond(res, 201, data);
});
