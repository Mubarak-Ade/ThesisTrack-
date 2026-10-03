import { Router } from 'express';

import {
  requireFeedbackAccess,
  requireProjectAccess,
  requireSubmissionAccess,
} from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  createFeedbackSchema,
  feedbackParamsSchema,
  patchFeedbackSchema,
  projectFeedbackParamsSchema,
  submissionFeedbackParamsSchema,
} from './schema.js';

const router = Router();

/*
 * §9.4 guard order, exactly:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → controller
 *
 * There is no `requireRole` on any feedback route: §4.5 "Feedback — create /
 * edit own / delete own" grants every role, and §11.7 says "any participant".
 * Participation (project guard) and authorship (row guard) are the only
 * restrictions, plus administrator `delete any`.
 *
 * §11.7's six endpoints:
 *   GET/POST /projects/:projectId/feedback   → project access (any participant)
 *   GET/POST /submissions/:submissionId/feedback → submission access
 *   PATCH /feedback/:feedbackId              → author only
 *   DELETE /feedback/:feedbackId             → author or administrator
 */

/* ------------------------------------------------- project-scoped thread */

router.get(
  '/projects/:projectId/feedback',
  validate(projectFeedbackParamsSchema, 'params'),
  requireProjectAccess(),
  controller.listForProject,
);

router.post(
  '/projects/:projectId/feedback',
  validate(projectFeedbackParamsSchema, 'params'),
  validate(createFeedbackSchema),
  requireProjectAccess(),
  controller.createProject,
);

/* ---------------------------------------------- submission-scoped thread */

router.get(
  '/submissions/:submissionId/feedback',
  validate(submissionFeedbackParamsSchema, 'params'),
  requireSubmissionAccess(),
  controller.listForSubmission,
);

router.post(
  '/submissions/:submissionId/feedback',
  validate(submissionFeedbackParamsSchema, 'params'),
  validate(createFeedbackSchema),
  requireSubmissionAccess(),
  controller.createSubmission,
);

/* ------------------------------------------------------- authorship rules */

router.patch(
  '/feedback/:feedbackId',
  validate(feedbackParamsSchema, 'params'),
  validate(patchFeedbackSchema),
  requireFeedbackAccess({ allow: ['author'] }),
  controller.patch,
);

router.delete(
  '/feedback/:feedbackId',
  validate(feedbackParamsSchema, 'params'),
  requireFeedbackAccess({ allow: ['author', 'admin'] }),
  controller.remove,
);

export default router;
