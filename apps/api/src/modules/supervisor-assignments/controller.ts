import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import * as service from './service.js';
import type { AssignSupervisorInput, AssignmentParams } from './schema.js';

// GET /projects/:projectId/supervisor — active relationship + history.
// The resource guard already loaded and authorized the project.
export const show = asyncHandler(async (req, res) => {
  const { projectId } = req.params as AssignmentParams;
  respond(res, 200, await service.getAssignmentOverview(projectId));
});

// POST /projects/:projectId/supervisor — assign THE supervisor (admin).
export const assign = asyncHandler(async (req, res) => {
  const { projectId } = req.params as AssignmentParams;
  const { supervisorId } = req.body as AssignSupervisorInput;
  const assignment = await service.assign(projectId, supervisorId, req.user!.id);
  respond(res, 201, { assignment });
});

// PATCH /projects/:projectId/supervisor — change: end current + insert next.
export const change = asyncHandler(async (req, res) => {
  const { projectId } = req.params as AssignmentParams;
  const { supervisorId } = req.body as AssignSupervisorInput;
  const assignment = await service.changeSupervisor(projectId, supervisorId, req.user!.id);
  respond(res, 200, { assignment });
});

// DELETE /projects/:projectId/supervisor — end now; the row stays as history.
export const end = asyncHandler(async (req, res) => {
  const { projectId } = req.params as AssignmentParams;
  const assignment = await service.end(projectId);
  respond(res, 200, { assignment });
});
