import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import { getProject } from '../../authz/index.js';
import type {
  CreateWorkflowInput,
  DuplicateWorkflowInput,
  ListWorkflowsQuery,
  PatchWorkflowInput,
  WorkflowParams,
} from './schema.js';
import * as service from './service.js';

/*
 * Thin handlers: guards (RBAC → validate → resource) already ran in
 * routes.ts per §9.4; business rules live in the service (§9.3).
 */

// GET /workflows — supervisor/admin/coordinator definitions list (§4.6 read row).
export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListWorkflowsQuery;
  const { workflows, total } = await service.listWorkflows(query, req.user!);
  respond(res, 200, {
    workflows,
    pagination: { page: query.page, limit: query.limit, total },
  });
});

// POST /workflows — admin/coordinator defines the process (§4.6).
export const create = asyncHandler(async (req, res) => {
  const input = req.body as CreateWorkflowInput;
  const detail = await service.createWorkflow(req.user!, input);
  respond(res, 201, detail);
});

// GET /workflows/:workflowId — definition + ordered stages.
export const show = asyncHandler(async (req, res) => {
  const { workflowId } = req.params as WorkflowParams;
  respond(res, 200, await service.getWorkflowDetail(workflowId, req.user!));
});

// PATCH /workflows/:workflowId — metadata and/or the whole stages[] set.
export const patch = asyncHandler(async (req, res) => {
  const { workflowId } = req.params as WorkflowParams;
  const input = req.body as PatchWorkflowInput;
  respond(res, 200, await service.patchWorkflow(workflowId, input, req.user!));
});

// POST /workflows/:workflowId/duplicate — archive source + new active version.
export const duplicate = asyncHandler(async (req, res) => {
  const { workflowId } = req.params as WorkflowParams;
  const input = req.body as DuplicateWorkflowInput;
  respond(res, 201, await service.duplicateWorkflow(workflowId, input, req.user!));
});

// DELETE /workflows/:workflowId — 422 when projects reference it (I15).
export const remove = asyncHandler(async (req, res) => {
  const { workflowId } = req.params as WorkflowParams;
  respond(res, 200, { workflow: await service.deleteWorkflow(workflowId) });
});

// GET /projects/:projectId/stages — FR-CW-05 tracker, computed at read.
export const getStages = asyncHandler(async (req, res) => {
  const tracker = await service.getStageTracker(getProject(req));
  respond(res, 200, tracker);
});

// POST /projects/:projectId/stages/advance — §11.14 gates, server-evaluated.
export const advance = asyncHandler(async (req, res) => {
  const tracker = await service.advanceStage(getProject(req), req.user!.id);
  respond(res, 200, tracker);
});
