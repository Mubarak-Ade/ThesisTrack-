import type { supervisorAssignments } from '../../schema/index.js';
import type { PublicUser, UserRow } from '../users/types.js';

export type SupervisorAssignmentRow = typeof supervisorAssignments.$inferSelect;

/** Assignment row joined with its supervisor (for responses). */
export type AssignmentWithSupervisor = SupervisorAssignmentRow & { supervisor: UserRow };

/** The API shape of an assignment — history's answer to who/when/by whom. */
export interface AssignmentView {
  id: string;
  projectId: string;
  isPrimary: boolean;
  assignedAt: Date;
  endedAt: Date | null;
  /** Admin who created this assignment (null = system/seed). */
  assignedBy: string | null;
  supervisor: PublicUser;
}

export interface AssignmentOverview {
  /** The single active relationship, or null when the project is unassigned. */
  active: AssignmentView | null;
  /** Ended relationships, most recent first — the preserved history. */
  history: AssignmentView[];
}
