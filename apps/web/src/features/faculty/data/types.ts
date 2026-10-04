/**
 * Faculty Supervisors models (spec §5.5). `facultyRepo` reads
 * `GET /users?role=supervisor` live first and falls back to the fixture
 * snapshot on any error, flagged via `usedFallback` for the sample banner
 * (spec §4 Rule 1, §10.4). Per-supervisor workload has no endpoint (§4.5),
 * so load fields are null on live rows. Screens import only from `data/index`.
 */

export type FacultyStatus = 'MAX LOAD' | 'ACTIVE' | 'ON LEAVE' | 'INACTIVE';

export interface SupervisorRow {
  name: string;
  /** Display code — fixtures keep mockup FAC-8821; live derives FAC-XXXX from the id. */
  code: string;
  email: string;
  /** §8.7 program — replaces the display-only `department` (ADR-11: no departments). */
  program: string;
  /** Current load / capacity — no workload endpoint (§4.5); null on live rows. */
  workloadStudents: number | null;
  capacity: number | null;
  /** Average thesis progress, 0–100 — no endpoint; null on live rows. */
  avgProgress: number | null;
  status: FacultyStatus;
  /** Relative activity label — no activity endpoint; null on live rows. */
  lastActivity: string | null;
}

/** Four live stat probes (spec §5.5) — notes are static copy, see fixtures. */
export interface FacultyStats {
  total: number;
  totalNote: string;
  activeSupervisors: number;
  activeSupervisorsNote: string;
  students: number;
  studentsNote: string;
  pending: number;
  pendingNote: string;
}

export interface ProgramDistributionEntry {
  program: string;
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
  /** Rows for the requested page only — paging/search happen server-side. */
  rows: SupervisorRow[];
  /** Full (or filtered) row count behind `page` — drives the pager. */
  total: number;
  /** Program groups — live: current page rows; fallback: fixture distribution. */
  distribution: ProgramDistributionEntry[];
  /** Workload alerts — live: always empty (no endpoint, §4.5). */
  alerts: LoadAlert[];
  systemNotice: string;
  adminTools: AdminTool[];
  /** True when fixtures answered (§10.4 — screen shows SampleDataBanner). */
  usedFallback: boolean;
}
