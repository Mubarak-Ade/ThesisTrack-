/**
 * Faculty Supervisors repository (spec §4):
 *  - reads → live API first (`GET /users?role=supervisor` + four `limit=1`
 *    stat probes), fixture snapshot on any error/shape drift flagged via
 *    `usedFallback` so the screen can show the sample banner (§10.4);
 *  - workload/load alerts have no endpoint (§4.5): live rows carry nulls,
 *    live alerts are empty, and `adminTools` stay fixture-backed.
 * Screens import from `data/index` — never raw DTOs.
 */
import { api } from '@/lib/api/http';
import { FACULTY_FIXTURES, FACULTY_STAT_NOTES } from './mock/fixtures';
import type {
  FacultySnapshot,
  FacultyStats,
  ProgramDistributionEntry,
  SupervisorRow,
} from './types';

export interface ListFacultyArgs {
  /** Defaults to 1. */
  page?: number;
  /** Defaults to 20. */
  limit?: number;
  /** Server-side `q` over name/email — debounced by the screen. */
  q?: string;
}

/** Honest live notice: workload lives nowhere in the MVP API (§4.5). */
const LIVE_SYSTEM_NOTICE =
  'Account-level view — per-supervisor workload has no MVP endpoint (spec §4.5).';

function warn(scope: string, error: unknown): void {
  console.warn(`[facultyRepo] ${scope}: using sample data —`, error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Display code (spec §4): `FAC-` + first 4 cleaned id chars, like USR codes. */
function asCode(id: string): string {
  const cleaned = id.replace(/-/g, '');
  return cleaned.length >= 4 ? `FAC-${cleaned.slice(0, 4).toUpperCase()}` : id;
}

/** §8.7 program — no department column exists (ADR-11), so absent → 'Unaffiliated'. */
function asProgram(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'Unaffiliated';
}

/** User row → live supervisor row. Structure is strict: throws → repo falls back. */
function mapSupervisor(value: unknown): SupervisorRow {
  const r = asRecord(value);
  const id = str(r.id);
  if (!id) throw new Error('GET /users: row missing `id` — response shape changed');
  return {
    name: `${str(r.firstName)} ${str(r.lastName)}`.trim(),
    code: asCode(id),
    email: str(r.email),
    program: asProgram(r.program),
    // §4.5 — no workload/activity endpoints: live rows honestly carry nulls.
    workloadStudents: null,
    capacity: null,
    avgProgress: null,
    status: r.isActive === true ? 'ACTIVE' : 'INACTIVE',
    lastActivity: null,
  };
}

/** List envelope → page rows + full count (throws on drift). */
function mapSupervisorsPage(value: unknown): { rows: SupervisorRow[]; total: number } {
  const r = asRecord(value);
  if (!Array.isArray(r.users)) {
    throw new Error('GET /users: `users` array missing — response shape changed');
  }
  const pagination = asRecord(r.pagination);
  return {
    rows: r.users.map(mapSupervisor),
    total: typeof pagination.total === 'number' ? pagination.total : r.users.length,
  };
}

/** Program groups of the visible rows (label = program, §5.5 dept chart honest). */
function buildDistribution(rows: SupervisorRow[]): ProgramDistributionEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.program, (counts.get(row.program) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([program, supervisors]) => ({ program, supervisors }))
    .sort((a, b) => b.supervisors - a.supervisors || a.program.localeCompare(b.program));
}

/** `limit=1` probe → `pagination.total` (spec §5.5 stat cards). */
async function probeTotal(path: string, key: 'users' | 'proposals'): Promise<number> {
  const r = asRecord(await api.get<unknown>(path));
  if (!Array.isArray(r[key])) {
    throw new Error(`GET ${path}: \`${key}\` array missing — response shape changed`);
  }
  const pagination = asRecord(r.pagination);
  return typeof pagination.total === 'number' ? pagination.total : (r[key] as unknown[]).length;
}

/** Four live counters (spec §5.5) — one `limit=1` probe each. */
async function liveStats(): Promise<FacultyStats> {
  const [total, activeSupervisors, students, pending] = await Promise.all([
    probeTotal('/users?role=supervisor&limit=1', 'users'),
    probeTotal('/users?role=supervisor&isActive=true&limit=1', 'users'),
    probeTotal('/users?role=student&limit=1', 'users'),
    probeTotal('/proposals?status=submitted&limit=1', 'proposals'),
  ]);
  return {
    total,
    totalNote: FACULTY_STAT_NOTES.total,
    activeSupervisors,
    activeSupervisorsNote: FACULTY_STAT_NOTES.activeSupervisors,
    students,
    studentsNote: FACULTY_STAT_NOTES.students,
    pending,
    pendingNote: FACULTY_STAT_NOTES.pending,
  };
}

/** Pinned query string (§A: page/limit/q + role=supervisor). */
function listQuery(args: { page: number; limit: number; q?: string }): string {
  const params = new URLSearchParams({ page: String(args.page), limit: String(args.limit) });
  const q = args.q?.trim();
  if (q) params.set('q', q);
  params.set('role', 'supervisor');
  return params.toString();
}

/** Same filtering, applied client-side to fixtures during fallback. */
function fallbackSnapshot(args: { page: number; limit: number; q?: string }): FacultySnapshot {
  const q = args.q?.trim().toLowerCase();
  const filtered = FACULTY_FIXTURES.rows.filter((row) => {
    if (!q) return true;
    return `${row.name} ${row.code} ${row.email} ${row.program}`.toLowerCase().includes(q);
  });
  const start = (args.page - 1) * args.limit;
  return {
    ...FACULTY_FIXTURES,
    rows: filtered.slice(start, start + args.limit),
    total: filtered.length,
    usedFallback: true,
  };
}

/**
 * One page of supervisors. Live path has no workload data (§4.5), so load
 * cells come back null, alerts are empty and the distribution reflects the
 * visible rows only; any error returns the filtered fixture snapshot.
 */
export async function getFaculty(args: ListFacultyArgs = {}): Promise<FacultySnapshot> {
  const page = args.page ?? 1;
  const limit = args.limit ?? 20;
  try {
    const [envelope, stats] = await Promise.all([
      api.get<unknown>(`/users?${listQuery({ page, limit, q: args.q })}`),
      liveStats(),
    ]);
    const { rows, total } = mapSupervisorsPage(envelope);
    return {
      stats,
      rows,
      total,
      distribution: buildDistribution(rows),
      alerts: [],
      systemNotice: LIVE_SYSTEM_NOTICE,
      adminTools: FACULTY_FIXTURES.adminTools,
      usedFallback: false,
    };
  } catch (error) {
    warn('getFaculty', error);
    return fallbackSnapshot({ page, limit, q: args.q });
  }
}
