/**
 * Coordinator Dashboard models (spec §5.2). `dashboardRepo` assembles them
 * from the live API and falls back to the §5.1 fixture snapshot behind the
 * same async shape, flagged via `usedFallback` (spec §4 Rule 1 — screens
 * never see raw DTOs).
 */

export interface ProjectProgress {
  total: number;
  active: number;
  completed: number;
  archived: number;
}

export interface DepartmentProgress {
  students: number;
  faculty: number;
  awaiting: number;
}

export type WorkspaceStatus =
  | 'IN PROGRESS'
  | 'PENDING REVIEW'
  | 'DELAYED'
  | 'COMPLETED'
  | 'ARCHIVED';

export interface WorkspaceRow {
  /** Project id — React key on live rows (fixture rows carry demo ids). */
  id: string;
  student: string;
  /** Thesis code shown under the name (`TH-2024-001`, spec §5.1) — fixture-only. */
  code?: string;
  project: string;
  /** Current workflow stage; absent when the live API reports none. */
  phase?: string;
  status: WorkspaceStatus;
  supervisor?: string;
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
  /** Destination for the CTA button (no longer hardcoded in the rail). */
  to: string;
}

/** Quick-action tile copy (spec §5.1) — shared by live and fallback paths. */
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
  /** True when fixtures answered (§10.4 — screen shows SampleDataBanner). */
  usedFallback: boolean;
}
