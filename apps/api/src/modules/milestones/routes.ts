import { Router } from 'express';

import { requireMilestoneAccess, requireProjectAccess, requireRole } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  changeMilestoneStatusSchema,
  createMilestoneSchema,
  createTemplateSchema,
  fromTemplateSchema,
  milestoneParamsSchema,
  patchMilestoneSchema,
  patchTemplateSchema,
  projectIdParamsSchema,
  reorderMilestonesSchema,
  templateParamsSchema,
} from './schema.js';

const router = Router();

/**
 * §9.4 guard order:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → controller
 *
 * §11.4 access column:
 *   read milestones        → project access (owner / assigned supervisor / admin)
 *   create/patch/delete/   → assigned supervisor / administrator
 *     reorder
 *   status change          → owner / assigned supervisor / admin, with the
 *                             per-role TARGET matrix in the service (students:
 *                             pending → in_progress → submitted; the rest: any)
 *   template read          → supervisor / administrator
 *   template write         → administrator (§4.6 — Coordinator defines)
 *   from-template          → administrator
 *
 * Every route owns exactly ONE resource-guard ownership rule; project-scoped
 * routes use `requireProjectAccess`, milestone-scoped routes use
 * `requireMilestoneAccess` (which resolves through the milestone's project).
 */

/* ------------------------------------------------------- milestones (§11.4) */

router.get(
  '/projects/:projectId/milestones',
  validate(projectIdParamsSchema, 'params'),
  requireProjectAccess(),
  controller.list,
);

router.post(
  '/projects/:projectId/milestones',
  requireRole('supervisor', 'administrator'),
  validate(projectIdParamsSchema, 'params'),
  validate(createMilestoneSchema),
  requireProjectAccess(),
  controller.create,
);

router.put(
  '/projects/:projectId/milestones/reorder',
  requireRole('supervisor', 'administrator'),
  validate(projectIdParamsSchema, 'params'),
  validate(reorderMilestonesSchema),
  requireProjectAccess(),
  controller.reorder,
);

router.post(
  '/projects/:projectId/milestones/from-template',
  requireRole('administrator'),
  validate(projectIdParamsSchema, 'params'),
  validate(fromTemplateSchema),
  requireProjectAccess(),
  controller.fromTemplate,
);

router.patch(
  '/milestones/:milestoneId',
  requireRole('supervisor', 'administrator'),
  validate(milestoneParamsSchema, 'params'),
  validate(patchMilestoneSchema),
  requireMilestoneAccess({ allow: ['supervisor', 'admin'] }),
  controller.patch,
);

router.delete(
  '/milestones/:milestoneId',
  requireRole('supervisor', 'administrator'),
  validate(milestoneParamsSchema, 'params'),
  requireMilestoneAccess({ allow: ['supervisor', 'admin'] }),
  controller.remove,
);

// No requireRole: the three project roles may all attempt; the service applies
// §11.4's per-role target matrix (422 outside a role's permitted targets).
router.post(
  '/milestones/:milestoneId/status',
  validate(milestoneParamsSchema, 'params'),
  validate(changeMilestoneStatusSchema),
  requireMilestoneAccess(),
  controller.status,
);

/* ------------------------------------------------------------- templates */

router.get(
  '/milestone-templates',
  requireRole('supervisor', 'administrator'),
  controller.listTemplates,
);

router.post(
  '/milestone-templates',
  requireRole('administrator'),
  validate(createTemplateSchema),
  controller.createTemplate,
);

router.patch(
  '/milestone-templates/:templateId',
  requireRole('administrator'),
  validate(templateParamsSchema, 'params'),
  validate(patchTemplateSchema),
  controller.patchTemplate,
);

router.delete(
  '/milestone-templates/:templateId',
  requireRole('administrator'),
  validate(templateParamsSchema, 'params'),
  controller.deleteTemplate,
);

export default router;
