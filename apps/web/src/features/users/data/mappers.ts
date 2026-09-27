/**
 * One mapper per API shape (spec §4, Rule 2): known fields picked explicitly,
 * unknown fields ignored, missing fields defaulted. Field-level drift is
 * absorbed here; structure-level drift throws so the repo can fall back.
 */
import { ROLES } from './constants';
import type {
  ContactExtras,
  ConsoleUser,
  CreateUserInput,
  ImportRow,
  Role,
  UserDetail,
  UserStatus,
} from './types';

const EMPTY_EXTRAS: ContactExtras = {
  department: null,
  phone: null,
  address: null,
  portalLanguage: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStatus(value: unknown, isActive: boolean): UserStatus {
  const raw = str(value).toUpperCase();
  if (raw === 'ACTIVE' || raw === 'INVITED' || raw === 'INACTIVE') return raw;
  return isActive ? 'ACTIVE' : 'INVITED';
}

function asRole(value: unknown): Role {
  return (ROLES as readonly string[]).includes(str(value)) ? (value as Role) : 'student';
}

/**
 * Display code (spec §4, mockup parity): fixture-provided codes pass through;
 * live rows derive `USR-` + first 4 hex chars of the id. Malformed/short ids
 * fall back to the id itself (never invented data).
 */
function asCode(id: string, given: unknown): string {
  if (typeof given === 'string' && given.length > 0) return given;
  const cleaned = id.replace(/-/g, '');
  return cleaned.length >= 4 ? `USR-${cleaned.slice(0, 4).toUpperCase()}` : id;
}

/** PublicUser → ConsoleUser. Defensive at field level (§A shape). */
export function mapUserDto(value: unknown): ConsoleUser {
  const r = asRecord(value);
  const isActive = typeof r.isActive === 'boolean' ? r.isActive : false;
  const id = str(r.id);
  return {
    id,
    code: asCode(id, r.code),
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    email: str(r.email),
    role: asRole(r.role),
    status: asStatus(r.status, isActive),
    isActive,
    createdAt: nullableStr(r.createdAt),
    registrationNumber: nullableStr(r.registrationNumber),
  };
}

/** List envelope → page. Structure is strict: throws → repo falls back. */
export function mapUsersPage(value: unknown): {
  items: ConsoleUser[];
  total: number;
  page: number;
  limit: number;
} {
  const r = asRecord(value);
  if (!Array.isArray(r.users)) {
    throw new Error('GET /users: `users` array missing — response shape changed');
  }
  const p = asRecord(r.pagination);
  const count = r.users.length;
  return {
    items: r.users.map(mapUserDto),
    total: typeof p.total === 'number' ? p.total : count,
    page: typeof p.page === 'number' ? p.page : 1,
    limit: typeof p.limit === 'number' ? p.limit : count || 20,
  };
}

export function mapUserDetail(value: unknown): ConsoleUser {
  const r = asRecord(value);
  if (!r.user) throw new Error('GET /users/:id: `user` missing — response shape changed');
  return mapUserDto(r.user);
}

export function mapCreatedUser(value: unknown): { user: ConsoleUser; status: UserStatus } {
  const r = asRecord(value);
  if (!r.user) throw new Error('POST /users: `user` missing — response shape changed');
  const user = mapUserDto(r.user);
  const raw = str(r.status).toUpperCase();
  const status: UserStatus = raw === 'ACTIVE' || raw === 'INVITED' ? raw : user.status;
  return { user, status };
}

export function mapImportResult(value: unknown): { created: number } {
  const r = asRecord(value);
  if (typeof r.created === 'number') return { created: r.created };
  if (Array.isArray(r.users)) return { created: r.users.length };
  throw new Error('POST /users/import: result shape changed');
}

/** Form input → API body. Drops UI-only fields (§A: create takes 4 fields). */
export function toCreateBody(
  input: CreateUserInput | ImportRow,
): { firstName: string; lastName: string; email: string; role: Role } {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
  };
}

export function toImportPayload(
  rows: ImportRow[],
): { users: ReturnType<typeof toCreateBody>[] } {
  return { users: rows.map(toCreateBody) };
}

/** Merge live core with fixture extras into the profile model. */
export function withExtras(
  user: ConsoleUser,
  extras?: Partial<ContactExtras> | null,
  rails?: { theses: UserDetail['theses']; audit: UserDetail['audit']; activity: UserDetail['activity']; oversight: UserDetail['oversight'] },
): UserDetail {
  return {
    ...user,
    extras: { ...EMPTY_EXTRAS, ...extras },
    theses: rails?.theses ?? [],
    audit: rails?.audit ?? [],
    activity: rails?.activity ?? [],
    oversight: rails?.oversight ?? { lastLogin: '—', createdBy: '—', permissions: '—' },
  };
}
