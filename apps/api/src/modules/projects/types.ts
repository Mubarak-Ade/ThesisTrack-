import type { projects, supervisorAssignments } from '../../schema/index.js';

export type ProjectRow = typeof projects.$inferSelect;
export type SupervisorAssignmentRow = typeof supervisorAssignments.$inferSelect;
