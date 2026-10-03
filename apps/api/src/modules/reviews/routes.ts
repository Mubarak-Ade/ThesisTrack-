import { Router } from 'express';

import { requireProjectAccess, requireRole, requireSubmissionAccess } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  createReviewSchema,
  projectReviewParamsSchema,
  submissionReviewParamsSchema,
} from './schema.js';

const router = Router();

/*
 * §9.4 guard order, exactly:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → controller
 *
 * §11.6 access column:
 *   GET  (submission- or project-scoped) → project access (owner / assigned
 *     supervisor / admin) — §4.5 "Review — read"
 *   POST → supervisor or administrator, then the submission guard, which is
 *     what enforces I10: a supervisor without an active assignment has no
 *     project access and answers 403. §4.5 "Review — create" — a student,
 *     owner or not, is refused by `requireRole` before any resource loads
 *     ("student cannot review own work" is structural).
 */

/* ---------------------------------------------------------------- reads */

router.get(
  '/submissions/:submissionId/reviews',
  validate(submissionReviewParamsSchema, 'params'),
  requireSubmissionAccess(),
  controller.listForSubmission,
);

router.get(
  '/projects/:projectId/reviews',
  validate(projectReviewParamsSchema, 'params'),
  requireProjectAccess(),
  controller.listForProject,
);

/* --------------------------------------------------------------- writes */

router.post(
  '/submissions/:submissionId/reviews',
  requireRole('supervisor', 'administrator'),
  validate(submissionReviewParamsSchema, 'params'),
  validate(createReviewSchema),
  requireSubmissionAccess({ allow: ['supervisor', 'admin'] }),
  controller.create,
);

/*
 * I8, §11.6: there is no `PATCH`/`PUT`/`DELETE` for a review — not on this
 * router, not anywhere. `reviews` rows are written once; the absence of a
 * route is the enforcement, backed by the repository exporting no update or
 * delete function for them at all (asserted in tests, §17.2).
 */

export default router;
