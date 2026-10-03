import { Router, type RequestHandler } from 'express';

import {
  requireProjectAccess,
  requireRole,
  requireSubmissionAccess,
  requireSubmissionVersionAccess,
  requireWorkflow,
} from '../../authz/index.js';
import { uploadSubmissionFile } from '../../lib/storage.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  appendVersionSchema,
  createSubmissionSchema,
  listSubmissionsQuerySchema,
  patchSubmissionSchema,
  projectIdParamsSchema,
  submissionParamsSchema,
  versionParamsSchema,
} from './schema.js';
import {
  SUBMISSION_ACTION_ROLES,
  SUBMISSION_TRANSITIONS,
  type SubmissionAction,
} from './service.js';
import type { SubmissionStatus } from './types.js';

const router = Router();

/**
 * Layer 3 on every mutating route (spec §13.1). The resource guard cached
 * the submission on `req.submission`, so the load is free; a missing guard
 * degrades to 404.
 */
function submissionWorkflow(action: SubmissionAction): RequestHandler {
  return requireWorkflow<SubmissionStatus, SubmissionAction>({
    resource: 'Submission',
    load: async (req) => req.submission,
    action,
    transitions: SUBMISSION_TRANSITIONS,
    roles: SUBMISSION_ACTION_ROLES,
  });
}

/*
 * §9.4 guard order, exactly:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → requireWorkflow → controller
 *
 * multer is the one insertion the spec's list does not name, and it is placed
 * deliberately in both routes:
 *   - create   → between RBAC and validate(body): a multipart request carries
 *                its fields *in* the body multer parses, so validation cannot
 *                run first. RBAC has already refused every non-student, and a
 *                file that fails validation is unlinked on response close.
 *   - append   → after guard + workflow: no byte is written for a request
 *                that would have been refused (the proposals convention).
 *
 * §11.5 access column:
 *   read list/detail/versions/download → project access (owner / assigned
 *     supervisor / admin; §14.2 resolves versions through submission.project_id)
 *   create / patch / submit / append / delete → student, owner only
 *     (§4.5 "Submission — … (own)" rows)
 */

/* ---------------------------------------------------------------- reads */

router.get(
  '/projects/:projectId/submissions',
  validate(projectIdParamsSchema, 'params'),
  validate(listSubmissionsQuerySchema, 'query'),
  requireProjectAccess(),
  controller.list,
);

router.get(
  '/submissions/:submissionId',
  validate(submissionParamsSchema, 'params'),
  requireSubmissionAccess(),
  controller.show,
);

router.get(
  '/submissions/:submissionId/versions',
  validate(submissionParamsSchema, 'params'),
  requireSubmissionAccess(),
  controller.listVersions,
);

router.get(
  '/submission-versions/:versionId/download',
  validate(versionParamsSchema, 'params'),
  requireSubmissionVersionAccess(),
  controller.download,
);

/* --------------------------------------------------------------- writes */

router.post(
  '/submissions',
  requireRole('student'),
  uploadSubmissionFile, // multipart fields first, then §9.4's validate(body)
  validate(createSubmissionSchema),
  requireProjectAccess({ source: 'body' }),
  idempotency, // §11.12 — after the guards, before the side effect
  controller.create,
);

router.patch(
  '/submissions/:submissionId',
  requireRole('student'),
  validate(submissionParamsSchema, 'params'),
  validate(patchSubmissionSchema),
  requireSubmissionAccess({ allow: ['owner'] }),
  submissionWorkflow('patch'),
  controller.patch,
);

router.post(
  '/submissions/:submissionId/submit',
  requireRole('student'),
  validate(submissionParamsSchema, 'params'),
  requireSubmissionAccess({ allow: ['owner'] }),
  submissionWorkflow('submit'),
  controller.submit,
);

router.post(
  '/submissions/:submissionId/versions',
  requireRole('student'),
  validate(submissionParamsSchema, 'params'),
  validate(appendVersionSchema),
  requireSubmissionAccess({ allow: ['owner'] }),
  submissionWorkflow('append'),
  uploadSubmissionFile,
  idempotency, // §11.12 — multipart payload hashed incl. the file's bytes
  controller.appendVersion,
);

router.delete(
  '/submissions/:submissionId',
  requireRole('student'),
  validate(submissionParamsSchema, 'params'),
  requireSubmissionAccess({ allow: ['owner'] }),
  submissionWorkflow('delete'),
  controller.remove,
);

/*
 * REJECTED (I7, §11.5): there is no `PATCH`/`PUT`/`DELETE` for a version —
 * not here, not anywhere. `submission_versions` rows are written once; the
 * absence of a route is the enforcement, backed by the repository exporting
 * no update or delete function for them at all.
 */

export default router;
