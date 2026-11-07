/**
 * Defensive mappers for the project library (ADR-18).
 *
 * Rows pick fields explicitly — the client projection is as narrow as the
 * server one. A malformed row is dropped, never rendered as a half-row; only
 * the list envelope is strict, because a missing `projects` array means the
 * response cannot be trusted at all.
 */
import type {
  DepartmentFacet,
  LibraryDepartment,
  LibraryDetail,
  LibraryPage,
  LibraryPerson,
  LibraryRow,
  LibraryStatus,
} from './types';

const STATUSES: readonly string[] = ['active', 'completed', 'archived'];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStatus(value: unknown): LibraryStatus | null {
  return typeof value === 'string' && STATUSES.includes(value)
    ? (value as LibraryStatus)
    : null;
}

/** Deliberately ignores every field except id/firstName/lastName. */
function mapPerson(value: unknown): LibraryPerson | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    firstName: str(r.firstName),
    lastName: str(r.lastName),
  };
}

function mapDepartment(value: unknown): LibraryDepartment | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  return { id: r.id, name: r.name, code: nullableStr(r.code) };
}

/**
 * Row → LibraryRow. Missing id/title/status → null (the caller drops it).
 * Optional fields become `null`/`[]`, never `undefined`.
 */
export function mapLibraryRow(value: unknown): LibraryRow | null {
  const r = asRecord(value);
  const status = asStatus(r.status);
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || !status) return null;

  const supervisors = Array.isArray(r.supervisors)
    ? r.supervisors
        .map(mapPerson)
        .filter((person): person is LibraryPerson => person !== null)
    : [];

  return {
    id: r.id,
    title: r.title,
    description: str(r.description),
    status,
    session: nullableStr(r.session),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    student: mapPerson(r.student) ?? { id: '', firstName: '', lastName: '' },
    department: mapDepartment(r.department),
    supervisors,
    score: typeof r.score === 'number' ? r.score : null,
    excerpt: nullableStr(r.excerpt),
  };
}

export function mapDepartmentFacet(value: unknown): DepartmentFacet | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    count: typeof r.count === 'number' ? r.count : 0,
  };
}

/** `{projects, departments, pagination}` → page. Structure drift throws. */
export function mapLibraryPage(
  payload: unknown,
  args: { page: number; limit: number },
): LibraryPage {
  const r = asRecord(payload);
  const list = r.projects;
  if (!Array.isArray(list)) throw new Error('project-library envelope missing');

  const items = list.map(mapLibraryRow).filter((row): row is LibraryRow => row !== null);
  const departments = Array.isArray(r.departments)
    ? r.departments
        .map(mapDepartmentFacet)
        .filter((facet): facet is DepartmentFacet => facet !== null)
    : [];
  const pagination = asRecord(r.pagination);

  return {
    items,
    total: typeof pagination.total === 'number' ? pagination.total : items.length,
    page: typeof pagination.page === 'number' ? pagination.page : args.page,
    limit: typeof pagination.limit === 'number' ? pagination.limit : args.limit,
    departments,
  };
}

/** `{project, similar}` → detail; `null` when the project row is malformed. */
export function mapLibraryDetail(payload: unknown): LibraryDetail | null {
  const r = asRecord(payload);
  const project = mapLibraryRow(r.project);
  if (!project) return null;

  const similar = Array.isArray(r.similar)
    ? r.similar.map(mapLibraryRow).filter((row): row is LibraryRow => row !== null)
    : [];

  return { project, similar };
}

/** `{matches}` → rows; an absent list is an empty result, not an error. */
export function mapSimilarMatches(payload: unknown): LibraryRow[] {
  const r = asRecord(payload);
  if (!Array.isArray(r.matches)) return [];
  return r.matches.map(mapLibraryRow).filter((row): row is LibraryRow => row !== null);
}
