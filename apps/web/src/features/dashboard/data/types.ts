/**
 * Coordinator Dashboard models (spec §5.2). All data below has no endpoint —
 * `dashboardRepo` serves fixtures behind the same async shape a live repo
 * would use, so swapping the source later touches only `data/` (spec §4 Rule 1).
 */

export interface ProjectProgress {
  total: number;
  active: number;
  completed: number;
  atRisk: number;
}

export interface DepartmentProgress {
  students: number;
  assigned: number;
  unassigned: number;
}

export type WorkspaceStatus = 'IN PROGRESS' | 'PENDING REVIEW' | 'DELAYED' | 'COMPLETED';

export interface WorkspaceRow {
  student: string;
  /** Thesis code shown under the name (`TH-2024-001`, spec §5.1). */
  code: string;
  project: string;
  phase: string;
  status: WorkspaceStatus;
  supervisor: string;
}

export type TaskKind = 'UPCOMING' | 'ACTION REQUIRED' | 'OVERDUE';

export interface TaskItem {
  kind: TaskKind;
  title: string;
  due: string;
}

export interface CriticalTask {
  bodyLead: string;
  dateEm: string;
  bodyTail: string;
  cta: string;
}

/** Quick-action tile copy (spec §5.1) — routes/CSV live with the screen. */
export interface QuickAction {
  label: string;
  hint: string;
  /** Internal destination, or a client-side CSV export (exactly one). */
  to?: string;
  csv?: boolean;
}

export interface TaskGroups {
  upcoming: TaskItem[];
  action: TaskItem[];
  overdue: TaskItem[];
  critical: CriticalTask;
}

export interface DashActivity {
  iconKind: 'feedback' | 'proposal' | 'milestone';
  before?: string;
  strong: string;
  after?: string;
  when: string;
}

export interface DashboardData {
  project: ProjectProgress;
  department: DepartmentProgress;
  workspace: WorkspaceRow[];
  /** Branded directory total for the table footer (spec §5.1). */
  workspaceTotal: number;
  tasks: TaskGroups;
  activity: DashActivity[];
  quickActions: QuickAction[];
}
