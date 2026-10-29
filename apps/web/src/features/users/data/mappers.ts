/**
 * One mapper per API shape (spec §4, Rule 2): known fields picked explicitly,
 * unknown fields ignored, missing fields defaulted. Field-level drift is
 * absorbed here; structure-level drift throws so the repo can fall back.
 */
import { mapDepartmentRef } from '@/features/departments/data/mappers';
import { formatRelative } from '@/lib/utils/time';
import { ROLES } from './constants';
import type {
  ActivityItem,
  ContactExtras,
  ConsoleUser,
  CreateUserInput,
  ImportRow,
  Oversight,
  Role,
  ThesisCard,
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
    // Managed department (design 2026-10-28); absent/malformed → null.
    department: mapDepartmentRef(r.department),
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

/** Request body for `POST /users` and each `/users/import` row. */
export interface CreateBody {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** Required by the API when role is `student`; optional for supervisors. */
  registrationNumber?: string;
  /** Managed department; omitted when blank (unaffiliated → default workflow). */
  departmentId?: string;
}

/** Form input → API body. Carries the registration number and department id. */
export function toCreateBody(input: CreateUserInput | ImportRow): CreateBody {
  const body: CreateBody = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
  };
  const registrationNumber = input.registrationNumber?.trim();
  if (registrationNumber) body.registrationNumber = registrationNumber;
  const departmentId = input.departmentId?.trim();
  if (departmentId) body.departmentId = departmentId;
  return body;
}

export function toImportPayload(rows: ImportRow[]): { users: CreateBody[] } {
  return { users: rows.map(toCreateBody) };
}

/**
 * CSV department NAMES → ids (design 2026-10-28 §5). Matching is
 * case-insensitive on the managed list, so a spreadsheet exported before a
 * rename still resolves; an unknown or ambiguous name is reported per row
 * rather than silently imported as unaffiliated.
 */
export function resolveImportDepartments(
  rows: ImportRow[],
  departments: { id: string; name: string }[],
): { resolved: ImportRow[]; unmatched: { index: number; department: string }[] } {
  const byName = new Map(departments.map((row) => [row.name.trim().toLowerCase(), row.id]));
  const unmatched: { index: number; department: string }[] = [];
  const resolved = rows.map((row, index) => {
    const name = row.department?.trim();
    if (!name) return { ...row, departmentId: null };
    const id = byName.get(name.toLowerCase());
    if (!id) {
      unmatched.push({ index, department: name });
      return row;
    }
    return { ...row, departmentId: id };
  });
  return { resolved, unmatched };
}

/* ------------------------------------------- live profile rails (§16.3) */

/** One row of `GET /projects` as the thesis rail needs it. */
export interface ProjectRef {
  id: string;
  title: string;
  /** Enum from the API; drifts to 'unknown' rather than inventing a state. */
  status: string;
  updatedAt: string;
}

/** `GET /projects` envelope → the profile's rows. Structure drift throws. */
export function mapProjectRefs(value: unknown): ProjectRef[] {
  const r = asRecord(value);
  if (!Array.isArray(r.projects)) {
    throw new Error('GET /projects: `projects` array missing — response shape changed');
  }
  return r.projects.map((raw) => {
    const p = asRecord(raw);
    return {
      id: str(p.id),
      title: str(p.title),
      status: str(p.status, 'unknown'),
      updatedAt: str(p.updatedAt),
    };
  });
}

/**
 * `GET /projects/:id/supervisor` → "First Last" / "Unassigned". Tolerant of a
 * missing supervisor (no assignment), strict about a missing `active` key
 * (structure drift), matching the Students-page parser (Phase 14 F1).
 */
export function mapSupervisorName(value: unknown): string {
  const payload = asRecord(value);
  if (!('active' in payload)) {
    throw new Error('GET /projects/:id/supervisor: `active` missing — response shape changed');
  }
  const active = asRecord(payload.active); // `active: null` → {} → no supervisor
  const person = asRecord(active.supervisor);
  return `${str(person.firstName)} ${str(person.lastName)}`.trim() || 'Unassigned';
}

/** `GET /projects/:id/milestones` → row count (drift throws). */
export function mapMilestoneCount(value: unknown): number {
  const r = asRecord(value);
  if (!Array.isArray(r.milestones)) {
    throw new Error('GET /projects/:id/milestones: `milestones` array missing — response shape changed');
  }
  return r.milestones.length;
}

/** One raw row of `GET /projects/:id/activity` (§11.13 derived feed). */
export interface ActivityEntry {
  kind: string;
  summary: string;
  /** Raw ISO timestamp — kept for the newest-first merge. */
  at: string;
  /** Parsed epoch ms for sorting; 0 when unparseable. */
  atMs: number;
}

/** `GET /projects/:id/activity` envelope → sorted-capable entries (drift throws). */
export function mapActivityEntries(value: unknown): ActivityEntry[] {
  const r = asRecord(value);
  if (!Array.isArray(r.activity)) {
    throw new Error('GET /projects/:id/activity: `activity` array missing — response shape changed');
  }
  return r.activity.map((raw) => {
    const row = asRecord(raw);
    const at = str(row.at);
    const ms = new Date(at).getTime();
    return {
      kind: str(row.kind),
      summary: str(row.summary),
      at,
      atMs: Number.isFinite(ms) ? ms : 0,
    };
  });
}

/** The nine §11.13 kinds → the rail's three icon buckets. */
function activityIcon(kind: string): ActivityItem['iconKind'] {
  if (kind === 'proposal.submitted' || kind === 'submission.created') return 'upload';
  if (kind.endsWith('.reviewed') || kind.endsWith('.completed') || kind === 'feedback.created') {
    return 'approve';
  }
  return 'system';
}

/** Entry → display item. `now` injectable so the relative time is testable. */
export function toActivityItem(entry: ActivityEntry, now?: number): ActivityItem {
  return {
    iconKind: activityIcon(entry.kind),
    strong: entry.summary,
    when: entry.atMs > 0 ? formatRelative(entry.atMs, now) : '—',
  };
}

/**
 * Live core + live rails into the profile model (§16.3 User details).
 * `extras` stays empty — no contact endpoint exists (parity §5.4 `—` rows).
 */
export function withRails(
  user: ConsoleUser,
  rails: {
    theses: ThesisCard[];
    milestones: number;
    activity: ActivityItem[];
    oversight: Oversight;
    railsError: boolean;
  },
): UserDetail {
  return { ...user, extras: { ...EMPTY_EXTRAS, department: user.department?.name ?? null }, ...rails };
}
