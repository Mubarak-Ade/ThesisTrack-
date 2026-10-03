import { getProject, getSubmission } from '../../authz/index.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type { CreateReviewInput } from './schema.js';
import * as service from './service.js';

/*
 * Thin handlers: guards (RBAC → validate → resource) already ran in
 * routes.ts per §9.4; each handler resolves what the guard cached and
 * delegates the business rules to the service.
 */

// GET /submissions/:submissionId/reviews — §11.6, append-only, newest first.
export const listForSubmission = asyncHandler(async (req, res) => {
  respond(res, 200, {
    reviews: await service.listReviewsForSubmission(getSubmission(req).id),
  });
});

// POST /submissions/:submissionId/reviews — assigned supervisor / admin.
export const create = asyncHandler(async (req, res) => {
  const input = req.body as CreateReviewInput;
  respond(
    res,
    201,
    await service.createReview(getSubmission(req), input, req.user!.id),
  );
});

// GET /projects/:projectId/reviews — cross-submission history (§11.6).
export const listForProject = asyncHandler(async (req, res) => {
  respond(res, 200, { reviews: await service.listReviewsForProject(getProject(req).id) });
});
