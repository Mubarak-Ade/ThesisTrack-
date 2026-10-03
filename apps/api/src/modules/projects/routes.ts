import { Router } from 'express';

import { requireProjectAccess, requireRole } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  patchProjectSchema,
  projectIdParamsSchema,
} from './schema.js';

const router = Router();

/**
 * §9.4 guard order:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → controller
 *
 * §11.2 / §4.5 access column:
 *   list              → any authenticated user; SCOPED in the service
 *                       (student → own, supervisor → assigned, admin → all)
 *   create / patch    → admin (manual creation and §5.8-bound status edits)
 *   show / activity   → resource guard: owner / assigned supervisor / admin
 *
 * DELETE /projects/:projectId deliberately does not exist — REJECTED, archive
 * instead (I12, §11.2); `PATCH {status:'archived'}` is that archive.
 */

router.get('/projects', validate(listProjectsQuerySchema, 'query'), controller.list);

router.post(
  '/projects',
  requireRole('administrator'),
  validate(createProjectSchema),
  controller.create,
);

router.get(
  '/projects/:projectId',
  validate(projectIdParamsSchema, 'params'),
  requireProjectAccess(),
  controller.show,
);

router.patch(
  '/projects/:projectId',
  requireRole('administrator'),
  validate(projectIdParamsSchema, 'params'),
  validate(patchProjectSchema),
  requireProjectAccess(),
  controller.patch,
);

router.get(
  '/projects/:projectId/activity',
  validate(projectIdParamsSchema, 'params'),
  requireProjectAccess(),
  controller.activity,
);

export default router;
