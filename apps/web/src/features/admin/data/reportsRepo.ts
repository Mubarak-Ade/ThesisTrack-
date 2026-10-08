/**
 * Reports repository (spec §4 R13, §16.3) — headline counts plus datasets
 * serialized by the shared `lib/csv.ts` (plan 13.4: no new dependency).
 *
 * Counts come from `pagination.total` probes (`limit=1`), never from counting
 * a rendered page. Datasets are built on click, page-walking up to a hard cap
 * with an honest `note` when the cap trims the export. LIVE-ONLY: a report is
 * a document — it must never contain sample rows.
 */
import { api } from '@/lib/api/http';
import { countProjectsByStatus } from './projectsRepo';
import { getStudentAssignment, listStudents } from './assignmentsRepo';
import { mapPaged, mapProjectRow, mapStudentRow, mapSupervisorRow } from './mappers';
import type {
  AdminProjectRow,
  DirectoryStudent,
  DirectorySupervisor,
  ReportCounts,
  ReportDataset,
  ReportKey,
} from './types';

/** Hard cap per dataset — beyond it the export says so in `note`. */
const CAP = 500;
const PAGE = 100;

/** `?limit=1` probe against any paged list endpoint. */
async function count(path: string): Promise<number> {
  const sep = path.includes('?') ? '&' : '?';
  const r = (await api.get<unknown>(`${path}${sep}page=1&limit=1`)) as Record<string, unknown>;
  const p = (r.pagination ?? {}) as Record<string, unknown>;
  return typeof p.total === 'number' ? p.total : 0;
}

/** Walk every page of a list endpoint until `cap` rows are collected. */
async function collect<T>(
  path: string,
  key: string,
  mapRow: (raw: unknown) => T,
  cap = CAP,
): Promise<{ rows: T[]; total: number }> {
  const rows: T[] = [];
  let page = 1;
  let total = 0;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const env = mapPaged<T>(
      await api.get<unknown>(`${path}${sep}page=${page}&limit=${PAGE}`),
      key,
      mapRow,
    );
    total = env.total;
    rows.push(...env.items);
    page += 1;
    if (env.items.length < PAGE) break;
  } while (rows.length < total && rows.length < cap);
  return { rows: rows.slice(0, cap), total };
}

const trimNote = (rows: number, total: number): string | undefined =>
  total > rows
    ? `First ${rows} of ${total} rows (export cap ${CAP}) — narrow the source and re-run.`
    : undefined;

export async function getReportCounts(): Promise<ReportCounts> {
  // Every `proposal_status` member is probed, so the caption always sums to
  // `proposalsTotal` (the Projects card enumerates its full status set the same
  // way — a partial breakdown next to a total reads as a miscount).
  const [
    projects,
    students,
    faculty,
    proposalsTotal,
    proposalsDraft,
    proposalsSubmitted,
    proposalsUnderReview,
    proposalsRevisionRequired,
    proposalsApproved,
    proposalsRejected,
  ] = await Promise.all([
    countProjectsByStatus(),
    count('/users?role=student'),
    count('/users?role=supervisor'),
    count('/proposals'),
    count('/proposals?status=draft'),
    count('/proposals?status=submitted'),
    count('/proposals?status=under_review'),
    count('/proposals?status=revision_required'),
    count('/proposals?status=approved'),
    count('/proposals?status=rejected'),
  ]);
  return {
    students,
    faculty,
    projectsTotal: projects.total,
    projectsActive: projects.active,
    projectsCompleted: projects.completed,
    projectsArchived: projects.archived,
    proposalsTotal,
    proposalsDraft,
    proposalsSubmitted,
    proposalsUnderReview,
    proposalsRevisionRequired,
    proposalsApproved,
    proposalsRejected,
  };
}

/** Build one dataset on click; the screen hands it straight to `downloadCsv`. */
export async function buildReport(key: ReportKey): Promise<ReportDataset> {
  if (key === 'projects') {
    const { rows, total } = await collect<AdminProjectRow>('/projects', 'projects', mapProjectRow);
    return {
      key,
      filename: 'thesistrack-projects.csv',
      headers: ['Title', 'Student', 'Email', 'Status', 'Created', 'Updated'],
      rows: rows.map((p) => [
        p.title,
        p.studentName,
        p.studentEmail,
        p.status,
        p.createdAt,
        p.updatedAt,
      ]),
      note: trimNote(rows.length, total),
    };
  }

  if (key === 'students') {
    const { rows, total } = await collect<DirectoryStudent>(
      '/users?role=student',
      'users',
      mapStudentRow,
    );
    return {
      key,
      filename: 'thesistrack-students.csv',
      headers: ['Name', 'Email', 'Program', 'Account', 'Created'],
      rows: rows.map((s) => [
        s.name,
        s.email,
        s.program ?? '',
        s.isActive ? 'active' : 'inactive',
        s.createdAt,
      ]),
      note: trimNote(rows.length, total),
    };
  }

  if (key === 'faculty') {
    const { rows, total } = await collect<DirectorySupervisor>(
      '/users?role=supervisor',
      'users',
      mapSupervisorRow,
    );
    return {
      key,
      filename: 'thesistrack-faculty.csv',
      headers: ['Name', 'Email', 'Account'],
      rows: rows.map((s) => [s.name, s.email, s.isActive ? 'active' : 'inactive']),
      note: trimNote(rows.length, total),
    };
  }

  if (key === 'proposals') {
    const { rows, total } = await collect<{
      title: string;
      student: string;
      email: string;
      status: string;
      version: number;
      updated: string;
    }>('/proposals', 'proposals', (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const s = (r.student ?? {}) as Record<string, unknown>;
      return {
        title: String(r.title ?? ''),
        student: `${String(s.firstName ?? '')} ${String(s.lastName ?? '')}`.trim(),
        email: String(s.email ?? ''),
        status: String(r.status ?? ''),
        version: typeof r.version === 'number' ? r.version : 0,
        updated:
          r.updatedAt instanceof Date
            ? r.updatedAt.toISOString()
            : String(r.updatedAt ?? ''),
      };
    });
    return {
      key,
      filename: 'thesistrack-proposals.csv',
      headers: ['Title', 'Student', 'Email', 'Status', 'Version', 'Updated'],
      rows: rows.map((p) => [p.title, p.student, p.email, p.status, p.version, p.updated]),
      note: trimNote(rows.length, total),
    };
  }

  // assignments — students with their ACTIVE supervisor (Flow C state, §11.1).
  const students = await listStudents({ page: 1, limit: CAP });
  const rows = await Promise.all(
    students.items.map(async (student) => {
      const assignment = await getStudentAssignment(student.id);
      const active = assignment.active;
      return [
        student.name,
        student.email,
        student.program ?? '',
        active ? active.supervisor.name : 'Unassigned',
        active ? active.supervisor.email : '',
        active?.assignedAt ?? '',
      ] as (string | number)[];
    }),
  );
  return {
    key,
    filename: 'thesistrack-assignments.csv',
    headers: ['Student', 'Email', 'Program', 'Active supervisor', 'Supervisor email', 'Assigned at'],
    rows,
    note:
      students.total > students.items.length
        ? `First ${students.items.length} of ${students.total} students (export cap).`
        : undefined,
  };
}
