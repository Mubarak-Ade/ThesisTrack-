/**
 * User-management repository (spec §4):
 *  - reads  → live API first, mock snapshot on any error/shape drift,
 *             flagged via `usedFallback` so UIs can show the sample banner;
 *  - writes → always surface errors (Rule 3: never fake success).
 * Screens import from this file (or `data/index`) — never raw DTOs.
 */
import { api, ApiError } from '@/lib/api/http';
import {
  mapCreatedUser,
  mapImportResult,
  mapUserDetail,
  mapUsersPage,
  toCreateBody,
  toImportPayload,
  withExtras,
} from './mappers';
import {
  MOCK_CONTACT_EXTRAS,
  MOCK_SECURITY_LOGS,
  MOCK_STATS,
  MOCK_USERS,
  PROFILE_RAILS,
} from './mock/fixtures';
import type {
  ConsoleStats,
  ConsoleUser,
  CreatedUser,
  CreateUserInput,
  ImportResult,
  ImportRow,
  ListUsersArgs,
  SecurityLog,
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

/** Stat cards: total live via a `limit=1` probe; the rest have no endpoint. */
export async function getStats(): Promise<ConsoleStats> {
  const base = {
    students: MOCK_STATS.students,
    faculty: MOCK_STATS.faculty,
    alerts: MOCK_STATS.alerts,
    totalDelta: MOCK_STATS.totalDelta,
    engagement: MOCK_STATS.engagement,
    facultyNote: MOCK_STATS.facultyNote,
    alertsNote: MOCK_STATS.alertsNote,
  };
  try {
    const { total } = mapUsersPage(await api.get<unknown>('/users?page=1&limit=1'));
    return { ...base, total, usedFallback: false };
  } catch (error) {
    warn('getStats', error);
    return { ...base, total: MOCK_STATS.total, usedFallback: true };
  }
}

/**
 * Profile: live core merged with fixture extras/rails. Unknown id → null
 * (honest not-found; a fixture id falls back to its sample row).
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
  return withExtras(core, MOCK_CONTACT_EXTRAS[core.id] ?? null, PROFILE_RAILS);
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

/** Security-log rail — no endpoint, always fixtures (async for uniform shape). */
export async function listSecurityLogs(): Promise<SecurityLog[]> {
  return MOCK_SECURITY_LOGS;
}

export { ApiError };
