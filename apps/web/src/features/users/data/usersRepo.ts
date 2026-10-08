/**
 * User-management repository (spec §4):
 *  - reads  → live API first, mock snapshot on any error/shape drift,
 *             flagged via `usedFallback` so UIs can show the sample banner;
 *  - writes → always surface errors (Rule 3: never fake success).
 * Screens import from this file (or `data/index`) — never raw DTOs.
 */
import { api, ApiError } from '@/lib/api/http';
import { formatRelative } from '@/lib/utils/time';
import { ROLE_LABELS } from './constants';
import {
  mapActivityEntries,
  mapCreatedUser,
  mapImportResult,
  mapMilestoneCount,
  mapProjectRefs,
  mapSupervisorName,
  mapUserDetail,
  mapUsersPage,
  toActivityItem,
  toCreateBody,
  toImportPayload,
  withRails,
} from './mappers';
import { MOCK_STATS, MOCK_USERS } from './mock/fixtures';
import type {
  ActivityItem,
  ConsoleStats,
  ConsoleUser,
  CreatedUser,
  CreateUserInput,
  ImportResult,
  ImportRow,
  ListUsersArgs,
  Oversight,
  ThesisCard,
  UpdateUserInput,
  UserDetail,
  UsersPage,
} from './types';

function warn(scope: string, error: unknown): void {
  console.warn(`[usersRepo] ${scope}: using sample data —`, error);
}

/** Build the pinned query string (§A: page/limit/q/role/isActive). */
function listQuery(args: ListUsersArgs): string {
  const params = new URLSearchParams({ page: String(args.page), limit: String(args.limit) });
  const q = args.q?.trim();
  if (q) params.set('q', q);
  if (args.role) params.set('role', args.role);
  if (args.isActive !== undefined) params.set('isActive', String(args.isActive));
  return params.toString();
}

/** Same filtering, applied client-side to fixtures during fallback. */
function filterMock(args: ListUsersArgs): ConsoleUser[] {
  const q = args.q?.trim().toLowerCase();
  return MOCK_USERS.filter((user) => {
    if (args.role && user.role !== args.role) return false;
    if (args.isActive !== undefined && user.isActive !== args.isActive) return false;
    if (q && !`${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export async function listUsers(args: ListUsersArgs): Promise<UsersPage> {
  try {
    const page = mapUsersPage(await api.get<unknown>(`/users?${listQuery(args)}`));
    return { ...page, usedFallback: false };
  } catch (error) {
    warn('listUsers', error);
    const filtered = filterMock(args);
    const start = (args.page - 1) * args.limit;
    return {
      items: filtered.slice(start, start + args.limit),
      total: filtered.length,
      page: args.page,
      limit: args.limit,
      usedFallback: true,
    };
  }
}

/** `limit=1` probe → `pagination.total` (structure drift throws → fallback). */
async function probeTotal(path: string): Promise<number> {
  return mapUsersPage(await api.get<unknown>(path)).total;
}

/** Stat cards: four live `limit=1` probes (§16.3 — Students-page pattern). */
export async function getStats(): Promise<ConsoleStats> {
  try {
    const [total, students, faculty, inactive] = await Promise.all([
      probeTotal('/users?page=1&limit=1'),
      probeTotal('/users?role=student&limit=1'),
      probeTotal('/users?role=supervisor&limit=1'),
      probeTotal('/users?isActive=false&limit=1'),
    ]);
    return { total, students, faculty, inactive, usedFallback: false };
  } catch (error) {
    warn('getStats', error);
    return { ...MOCK_STATS, usedFallback: true };
  }
}

/** Honest oversight rows — no sign-in/creation audit exists (spec §19.2). */
const NO_AUDIT_OVERSIGHT: Oversight = { lastLogin: '—', createdBy: '—', permissions: '—' };

/** Feed cap — the rail shows the most recent entries, bounded fan-out. */
const ACTIVITY_CAP = 10;

interface ProjectRails {
  theses: ThesisCard[];
  milestones: number;
  activity: ActivityItem[];
}

/**
 * Live rails (§16.3 User details): the profile's own projects
 * (`GET /projects?studentId=&limit=100`), then a per-project supervisor /
 * milestones / activity fan-out — bounded by that list, never the whole
 * department. Any failure throws; `getUser` turns it into `railsError`.
 */
async function fetchRails(studentId: string): Promise<ProjectRails> {
  const projects = mapProjectRefs(
    await api.get<unknown>(`/projects?studentId=${studentId}&limit=100`),
  );
  const perProject = await Promise.all(
    projects.map(async (project) => {
      const [supervisor, milestones, activity] = await Promise.all([
        api.get<unknown>(`/projects/${project.id}/supervisor`),
        api.get<unknown>(`/projects/${project.id}/milestones`),
        api.get<unknown>(`/projects/${project.id}/activity`),
      ]);
      return {
        thesis: {
          code: `#${project.id.slice(0, 8)}`,
          badge: project.status.toUpperCase(),
          title: project.title,
          supervisor: mapSupervisorName(supervisor),
          updated: formatRelative(project.updatedAt) || '—',
        },
        milestoneCount: mapMilestoneCount(milestones),
        entries: mapActivityEntries(activity),
      };
    }),
  );
  return {
    theses: perProject.map((row) => row.thesis),
    milestones: perProject.reduce((sum, row) => sum + row.milestoneCount, 0),
    activity: perProject
      .flatMap((row) => row.entries)
      .sort((a, b) => b.atMs - a.atMs)
      .slice(0, ACTIVITY_CAP)
      .map((entry) => toActivityItem(entry)),
  };
}

/**
 * Profile: live core + live project rails (§16.3 "User details ✅"). A failed
 * fan-out keeps the profile and flags `railsError` (honest error copy);
 * unknown id → null (honest not-found; a fixture id falls back to its row).
 */
export async function getUser(id: string): Promise<UserDetail | null> {
  let core: ConsoleUser;
  try {
    core = mapUserDetail(await api.get<unknown>(`/users/${id}`));
  } catch (error) {
    const fixture = MOCK_USERS.find((user) => user.id === id);
    if (!fixture) {
      warn('getUser', error);
      return null;
    }
    warn('getUser', error);
    core = fixture;
  }
  const oversight: Oversight = {
    ...NO_AUDIT_OVERSIGHT,
    // Live-derived: the role defines the account's permissions (§4.5).
    permissions: core.role === 'coordinator' ? 'Coordinator' : ROLE_LABELS[core.role] ?? '—',
  };
  try {
    const rails = await fetchRails(core.id);
    return withRails(core, { ...rails, oversight, railsError: false });
  } catch (error) {
    warn('getUser: rails', error);
    return withRails(core, {
      theses: [],
      milestones: 0,
      activity: [],
      oversight,
      railsError: true,
    });
  }
}

/** Provisioning write — throws ApiError for the form to render (Rule 3). */
export async function createUser(input: CreateUserInput): Promise<CreatedUser> {
  const payload = await api.post<unknown>('/users', toCreateBody(input));
  return mapCreatedUser(payload);
}

/** Re-send invitation (profile "Reset Password"). Write — errors surface. */
export async function sendInvite(id: string): Promise<{ status: string }> {
  const payload = (await api.post<unknown>(`/users/${id}/invite`)) as Record<string, unknown>;
  return { status: typeof payload.status === 'string' ? payload.status : 'INVITED' };
}

/** Bulk import write — 422 row errors surface to the wizard (§A). */
export async function importUsers(rows: ImportRow[]): Promise<ImportResult> {
  const payload = await api.post<unknown>('/users/import', toImportPayload(rows));
  return mapImportResult(payload);
}

/**
 * Partial profile patch (§11.0.2 — `{ program }`, `null` clears it). Returns
 * the row the server actually stored. Write: errors propagate (Rule 3).
 */
export async function updateUser(id: string, patch: UpdateUserInput): Promise<ConsoleUser> {
  const payload = await api.patch<unknown>(`/users/${id}`, patch);
  return mapUserDetail(payload);
}

export { ApiError };
