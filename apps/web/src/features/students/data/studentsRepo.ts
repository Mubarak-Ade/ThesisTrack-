/**
 * Student Management repository (spec §4):
 *  - reads → live API first (`GET /users?role=student` + one `/projects` read
 *    for thesis status, a per-row supervisor join for the visible page, and
 *    four `limit=1` stat probes), fixture snapshot on any error/shape drift
 *    flagged via `usedFallback` so the screen can show the sample banner
 *    (§10.4);
 *  - `infoCards` are navigation affordances, fixture-backed on both paths.
 * Screens import from `data/index` — never raw DTOs.
 */
import { api } from '@/lib/api/http';
import { STUDENTS_FIXTURES, STUDENT_STAT_NOTES } from './mock/fixtures';
import type { StudentRow, StudentSnapshot, StudentStats, ThesisStatus } from './types';

export interface ListStudentsArgs {
  /** Defaults to 1. */
  page?: number;
  /** Defaults to 20. */
  limit?: number;
  /** Server-side `q` over name/email — debounced by the screen. */
  q?: string;
}

function warn(scope: string, error: unknown): void {
  console.warn(`[studentsRepo] ${scope}: using sample data —`, error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Display code (spec §4): `STU-` + first 4 cleaned id chars, like USR codes. */
function asCode(id: string): string {
  const cleaned = id.replace(/-/g, '');
  return cleaned.length >= 4 ? `STU-${cleaned.slice(0, 4).toUpperCase()}` : id;
}

/** §8.7 program — no department column exists (ADR-11), so absent → 'Unaffiliated'. */
function asProgram(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'Unaffiliated';
}

function asYear(value: unknown): number | null {
  const parsed = new Date(str(value)).getFullYear();
  return Number.isFinite(parsed) && str(value) ? parsed : null;
}

/** A page row before the supervisor join (the join needs the id). */
interface LiveStudent {
  id: string;
  name: string;
  email: string;
  program: string;
  status: 'Active' | 'Inactive';
  enrolledYear: number | null;
}

/** User row → live student. Structure is strict: throws → repo falls back. */
function mapStudent(value: unknown): LiveStudent {
  const r = asRecord(value);
  const id = str(r.id);
  if (!id) throw new Error('GET /users: row missing `id` — response shape changed');
  return {
    id,
    name: `${str(r.firstName)} ${str(r.lastName)}`.trim(),
    email: str(r.email),
    program: asProgram(r.program),
    status: r.isActive === true ? 'Active' : 'Inactive',
    enrolledYear: asYear(r.createdAt),
  };
}

/** List envelope → page rows + full count (throws on drift). */
function mapStudentsPage(value: unknown): { students: LiveStudent[]; total: number } {
  const r = asRecord(value);
  if (!Array.isArray(r.users)) {
    throw new Error('GET /users: `users` array missing — response shape changed');
  }
  const pagination = asRecord(r.pagination);
  return {
    students: r.users.map(mapStudent),
    total: typeof pagination.total === 'number' ? pagination.total : r.users.length,
  };
}

/**
 * `GET /projects?limit=100` (admin sees all) → studentId → thesis status.
 * Unknown project statuses are drift, not guesses: throw → repo falls back.
 */
function mapThesisStatuses(value: unknown): Map<string, ThesisStatus> {
  const r = asRecord(value);
  if (!Array.isArray(r.projects)) {
    throw new Error('GET /projects: `projects` array missing — response shape changed');
  }
  const byStudent = new Map<string, ThesisStatus>();
  for (const raw of r.projects) {
    const project = asRecord(raw);
    const studentId = str(project.studentId);
    if (!studentId) continue;
    const status = str(project.status);
    if (status === 'active') byStudent.set(studentId, 'IN PROGRESS');
    else if (status === 'completed') byStudent.set(studentId, 'COMPLETED');
    else if (status === 'archived') byStudent.set(studentId, 'ARCHIVED');
    else throw new Error(`GET /projects: unknown status "${status}" — response shape changed`);
  }
  return byStudent;
}

/** `GET /students/:id/supervisor` → active assignment's name, else 'Unassigned'. */
async function fetchSupervisorName(studentId: string): Promise<string> {
  const payload = asRecord(await api.get<unknown>(`/students/${studentId}/supervisor`));
  if (!('active' in payload)) {
    throw new Error(
      `GET /students/${studentId}/supervisor: \`active\` missing — response shape changed`,
    );
  }
  if (payload.active === null || payload.active === undefined) return 'Unassigned';
  const active = asRecord(payload.active);
  return `${str(active.firstName)} ${str(active.lastName)}`.trim() || 'Unassigned';
}

/** `limit=1` probe → `pagination.total` (spec §5.6 stat cards). */
async function probeTotal(
  path: string,
  key: 'users' | 'projects' | 'proposals',
): Promise<number> {
  const r = asRecord(await api.get<unknown>(path));
  if (!Array.isArray(r[key])) {
    throw new Error(`GET ${path}: \`${key}\` array missing — response shape changed`);
  }
  const pagination = asRecord(r.pagination);
  return typeof pagination.total === 'number' ? pagination.total : (r[key] as unknown[]).length;
}

/** Four live counters (spec §5.6) — one `limit=1` probe each. */
async function liveStats(): Promise<StudentStats> {
  const [total, activeStudents, activeTheses, atRisk] = await Promise.all([
    probeTotal('/users?role=student&limit=1', 'users'),
    probeTotal('/users?role=student&isActive=true&limit=1', 'users'),
    probeTotal('/projects?status=active&limit=1', 'projects'),
    probeTotal('/proposals?status=rejected&limit=1', 'proposals'),
  ]);
  return {
    total,
    totalNote: STUDENT_STAT_NOTES.total,
    activeStudents,
    activeStudentsNote: STUDENT_STAT_NOTES.activeStudents,
    activeTheses,
    activeThesesNote: STUDENT_STAT_NOTES.activeTheses,
    atRisk,
    atRiskNote: STUDENT_STAT_NOTES.atRisk,
  };
}

/** Pinned query string (§A: page/limit/q + role=student). */
function listQuery(args: { page: number; limit: number; q?: string }): string {
  const params = new URLSearchParams({ page: String(args.page), limit: String(args.limit) });
  const q = args.q?.trim();
  if (q) params.set('q', q);
  params.set('role', 'student');
  return params.toString();
}

/** Same filtering, applied client-side to fixtures during fallback. */
function fallbackSnapshot(args: { page: number; limit: number; q?: string }): StudentSnapshot {
  const q = args.q?.trim().toLowerCase();
  const filtered = STUDENTS_FIXTURES.rows.filter((row) => {
    if (!q) return true;
    return `${row.name} ${row.code} ${row.email} ${row.program}`.toLowerCase().includes(q);
  });
  const start = (args.page - 1) * args.limit;
  return {
    ...STUDENTS_FIXTURES,
    rows: filtered.slice(start, start + args.limit),
    total: filtered.length,
    usedFallback: true,
  };
}

/**
 * One page of students. Live path joins projects (thesis status), the
 * per-row supervisor assignment (visible rows only) and four stat probes;
 * any error or shape drift returns the filtered fixture snapshot instead.
 */
export async function getStudents(args: ListStudentsArgs = {}): Promise<StudentSnapshot> {
  const page = args.page ?? 1;
  const limit = args.limit ?? 20;
  try {
    const [envelope, projects, stats] = await Promise.all([
      api.get<unknown>(`/users?${listQuery({ page, limit, q: args.q })}`),
      api.get<unknown>('/projects?limit=100'),
      liveStats(),
    ]);
    const { students, total } = mapStudentsPage(envelope);
    const statuses = mapThesisStatuses(projects);
    const rows: StudentRow[] = await Promise.all(
      students.map(async (student) => ({
        name: student.name,
        code: asCode(student.id),
        email: student.email,
        program: student.program,
        status: student.status,
        thesisStatus: statuses.get(student.id) ?? 'NO PROJECT',
        enrolledYear: student.enrolledYear,
        supervisor: await fetchSupervisorName(student.id),
      })),
    );
    return {
      stats,
      rows,
      total,
      infoCards: STUDENTS_FIXTURES.infoCards,
      usedFallback: false,
    };
  } catch (error) {
    warn('getStudents', error);
    return fallbackSnapshot({ page, limit, q: args.q });
  }
}
