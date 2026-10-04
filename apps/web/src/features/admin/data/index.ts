/**
 * Admin feature data barrel (spec §10.4) — screens import from here or the
 * individual repo, never raw DTOs.
 */
export * from './types';
export {
  listProjects,
  countProjectsByStatus,
  setProjectStatus,
} from './projectsRepo';
export {
  listStudents,
  listSupervisors,
  getStudentAssignment,
  assignSupervisor,
  changeSupervisor,
  endSupervisor,
} from './assignmentsRepo';
export {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  patchWorkflow,
  deleteWorkflow,
} from './workflowsRepo';
export { getMonitoring } from './monitoringRepo';
export { getReportCounts, buildReport } from './reportsRepo';
