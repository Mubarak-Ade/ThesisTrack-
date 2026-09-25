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
  code: string;
  project: string;
  phase: string;
  status: WorkspaceStatus;
  supervisor: string;
  updated: string;
}

export type TaskKind = 'UPCOMING' | 'ACTION REQUIRED' | 'OVERDUE';

export interface TaskItem {
  kind: TaskKind;
  title: string;
  due: string;
}

export interface CriticalTask {
  title: string;
  bodyLead: string;
  dateEm: string;
  bodyTail: string;
  cta: string;
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
  tasks: TaskGroups;
  activity: DashActivity[];
}
