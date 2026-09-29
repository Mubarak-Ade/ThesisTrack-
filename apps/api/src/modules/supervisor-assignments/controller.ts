import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import * as service from './service.js';
import type {
  AssignSupervisorInput,
  AssignmentParams,
  StudentAssignmentParams,
} from './schema.js';

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

/*
 * Student-scoped routes (§11). These are NOT sugar over the project routes:
 * they are the only way to reach a student who has no project yet, which is
 * exactly the state §8.2's nullable `project_id` was introduced to permit.
 */

// GET /students/:studentId/supervisor — student self / assigned supervisor / admin.
export const showForStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params as StudentAssignmentParams;
  respond(res, 200, await service.getStudentAssignmentOverview(studentId));
});

// POST /students/:studentId/supervisor — admin; 409 if THIS student is assigned.
export const assignForStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params as StudentAssignmentParams;
  const { supervisorId } = req.body as AssignSupervisorInput;
  const assignment = await service.assignToStudentFromStudentParam(
    studentId,
    supervisorId,
    req.user!.id,
  );
  respond(res, 201, { assignment });
});

// PATCH /students/:studentId/supervisor — admin; transactional end + insert.
export const changeForStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params as StudentAssignmentParams;
  const { supervisorId } = req.body as AssignSupervisorInput;
  const assignment = await service.changeSupervisorFromStudentParam(
    studentId,
    supervisorId,
    req.user!.id,
  );
  respond(res, 200, { assignment });
});

// DELETE /students/:studentId/supervisor — admin; soft end, row stays history.
export const endForStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params as StudentAssignmentParams;
  respond(res, 200, { assignment: await service.endFromStudentParam(studentId) });
});

// GET /supervisors/me/students — the caseload, one row per student (§6.2 I13).
export const caseload = asyncHandler(async (req, res) => {
  respond(res, 200, { students: await service.getCaseload(req.user!.id) });
});
