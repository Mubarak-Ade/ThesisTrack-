/**
 * Student Management models (spec §5.6). No enrollment/directory endpoint
 * exists — `studentsRepo` serves fixtures behind the same async shape a live
 * repo would use, so a future endpoint drops in behind one function
 * (spec §4 Rule 1). Screens import only from `data/index`.
 */

export type ThesisStatus = 'IN PROGRESS' | 'PROPOSED' | 'DELAYED' | 'COMPLETED';

export interface StudentRow {
  name: string;
  /** Mockup-style code (STU-2024-001) — fixtures only, like USR codes (spec §4). */
  code: string;
  email: string;
  level: string;
  department: string;
  thesisStatus: ThesisStatus;
  enrolledYear: number;
  supervisor: string;
}

export interface StudentStats {
  total: number;
  totalNote: string;
  postgraduates: number;
  postgraduatesNote: string;
  thesisActive: number;
  thesisActiveNote: string;
  riskAlerts: number;
  riskNote: string;
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
  rows: StudentRow[];
  infoCards: InfoCard[];
}
