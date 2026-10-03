import { getMilestone, getProject } from '../../authz/index.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type {
  ChangeMilestoneStatusInput,
  CreateMilestoneInput,
  CreateTemplateInput,
  FromTemplateInput,
  PatchMilestoneInput,
  PatchTemplateInput,
  ReorderMilestonesInput,
  TemplateParams,
} from './schema.js';
import * as service from './service.js';
import * as templates from './templates.js';

/*
 * Thin handlers: guards (RBAC → validate → resource) already ran in
 * routes.ts per §9.4; each handler resolves what the guard cached and
 * delegates the business rules to the service.
 */

// GET /projects/:projectId/milestones — order + computed overdue/state (§5.6).
export const list = asyncHandler(async (req, res) => {
  respond(res, 200, { milestones: await service.listMilestonesFor(getProject(req)) });
});

// POST /projects/:projectId/milestones — assigned supervisor / admin.
export const create = asyncHandler(async (req, res) => {
  const input = req.body as CreateMilestoneInput;
  const milestone = await service.createMilestone(getProject(req), input);
  respond(res, 201, { milestone });
});

// PATCH /milestones/:milestoneId — assigned supervisor / admin (§11.4).
export const patch = asyncHandler(async (req, res) => {
  const input = req.body as PatchMilestoneInput;
  respond(res, 200, { milestone: await service.patchMilestone(getMilestone(req), input) });
});

// DELETE /milestones/:milestoneId — submissions keep theirs (SET NULL, §8.7).
export const remove = asyncHandler(async (req, res) => {
  respond(res, 200, { milestone: await service.deleteMilestone(getMilestone(req)) });
});

// PUT /projects/:projectId/milestones/reorder — exact set, contiguous (§11.4).
export const reorder = asyncHandler(async (req, res) => {
  const input = req.body as ReorderMilestonesInput;
  respond(res, 200, { milestones: await service.reorderMilestones(getProject(req), input) });
});

// POST /milestones/:milestoneId/status — role matrix decides the target (§11.4).
export const status = asyncHandler(async (req, res) => {
  const input = req.body as ChangeMilestoneStatusInput;
  const milestone = await service.changeStatus(getProject(req), getMilestone(req), input, req.user!);
  respond(res, 200, { milestone });
});

// POST /projects/:projectId/milestones/from-template — admin, §8.5 offsets.
export const fromTemplate = asyncHandler(async (req, res) => {
  const { templateId } = req.body as FromTemplateInput;
  const milestones = await service.applyTemplateById(getProject(req), templateId);
  respond(res, 201, { milestones });
});

/* ------------------------------------------------------------- templates */

// GET /milestone-templates — supervisor / admin read (§11.4).
export const listTemplates = asyncHandler(async (_req, res) => {
  respond(res, 200, { templates: await templates.listTemplates() });
});

// POST /milestone-templates — admin; items may be empty (§8.5).
export const createTemplate = asyncHandler(async (req, res) => {
  const input = req.body as CreateTemplateInput;
  respond(res, 201, { template: await templates.createTemplate(req.user!.id, input) });
});

// PATCH /milestone-templates/:templateId — whole item set (ADR-05).
export const patchTemplate = asyncHandler(async (req, res) => {
  const { templateId } = req.params as TemplateParams;
  const template = await templates.getTemplate(templateId);
  const input = req.body as PatchTemplateInput;
  respond(res, 200, { template: await templates.patchTemplate(template, input) });
});

// DELETE /milestone-templates/:templateId — materialised milestones survive.
export const deleteTemplate = asyncHandler(async (req, res) => {
  const { templateId } = req.params as TemplateParams;
  const template = await templates.getTemplate(templateId);
  respond(res, 200, { template: await templates.deleteTemplate(template) });
});
