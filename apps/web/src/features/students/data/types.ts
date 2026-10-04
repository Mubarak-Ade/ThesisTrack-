/**
 * Student Management models (spec §5.6). `studentsRepo` reads
 * `GET /users?role=student` live first (with project/supervisor joins and
 * `limit=1` stat probes) and falls back to the fixture snapshot on any error,
 * flagged via `usedFallback` for the sample banner (spec §4 Rule 1, §10.4).
 * Screens import only from `data/index`.
 */

export type ThesisStatus =
  | 'IN PROGRESS'
  | 'PROPOSED'
  | 'DELAYED'
  | 'COMPLETED'
  /** Project row exists but is archived (live read). */
  | 'ARCHIVED'
  /** No project row for this student yet (live read). */
  | 'NO PROJECT';

export interface StudentRow {
  name: string;
  /** Display code — fixtures keep mockup STU-2024-001; live derives STU-XXXX from the id. */
  code: string;
  email: string;
  /** §8.7 program — 'Unaffiliated' when the account carries none (ADR-11: no departments). */
  program: string;
  /** Account state (`isActive`) — there is no department column in the API. */
  status: 'Active' | 'Inactive';
  thesisStatus: ThesisStatus;
  /** Year parsed from the account's `createdAt`; null when unreadable. */
  enrolledYear: number | null;
  supervisor: string;
}

/** Four live stat probes (spec §5.6) — notes are static copy, see fixtures. */
export interface StudentStats {
  total: number;
  totalNote: string;
  activeStudents: number;
  activeStudentsNote: string;
  activeTheses: number;
  activeThesesNote: string;
  atRisk: number;
  atRiskNote: string;
}

/** Bottom info cards — navigation affordances rendered by the screen. */
export interface InfoCard {
  title: string;
  body: string;
  cta: string;
  to?: string;
  toast?: string;
  /** Link color: green (primary) or blue, exactly as the mockup shows. */
  tone: 'primary' | 'blue';
}

export interface StudentSnapshot {
  stats: StudentStats;
  /** Rows for the requested page only — paging/search happen server-side. */
  rows: StudentRow[];
  /** Full (or filtered) row count behind `page` — drives the pager. */
  total: number;
  infoCards: InfoCard[];
  /** True when fixtures answered (§10.4 — screen shows SampleDataBanner). */
  usedFallback: boolean;
}
