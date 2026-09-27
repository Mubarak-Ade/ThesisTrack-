/**
 * Faculty Supervisors models (spec §5.5). No supervisor-workload endpoint
 * exists — `facultyRepo` serves fixtures behind the same async shape a live
 * repo would use, so a future endpoint drops in behind one function
 * (spec §4 Rule 1). Screens import only from `data/index`.
 */

export type FacultyStatus = 'MAX LOAD' | 'ACTIVE' | 'ON LEAVE';

export interface SupervisorRow {
  name: string;
  /** Mockup-style code (FAC-8821) — fixtures only, like USR codes (spec §4). */
  code: string;
  department: string;
  workloadStudents: number;
  /** Current-load capacity, used by the load alerts (e.g. 12/10). */
  capacity: number;
  /** Average thesis progress, 0–100. */
  avgProgress: number;
  status: FacultyStatus;
  /** Fixture-relative label ("2 hours ago") — no activity endpoint exists. */
  lastActivity: string;
}

export interface FacultyStats {
  total: number;
  totalNote: string;
  students: number;
  studentsNote: string;
  avgLoad: number;
  avgLoadNote: string;
  pending: number;
  pendingNote: string;
}

export interface DeptDistributionEntry {
  department: string;
  supervisors: number;
}

export interface LoadAlert {
  name: string;
  severity: 'danger' | 'warning';
  body: string;
}

/** Navigation affordance rendered by the screen (route or placeholder toast). */
export interface AdminTool {
  label: string;
  to?: string;
  toast?: string;
}

export interface FacultySnapshot {
  stats: FacultyStats;
  rows: SupervisorRow[];
  distribution: DeptDistributionEntry[];
  alerts: LoadAlert[];
  systemNotice: string;
  adminTools: AdminTool[];
}
