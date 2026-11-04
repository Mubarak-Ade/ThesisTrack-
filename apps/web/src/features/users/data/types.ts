/**
 * Stable internal models for the console's user-management data (spec §4).
 * Screens consume these types only — raw API DTOs never leave `data/`.
 */
import type { DepartmentRef } from '@/features/departments/data/types';

export type Role = 'student' | 'supervisor' | 'administrator' | 'coordinator';
/** Alias kept for backwards compatibility — now identical to `Role`. */
export type DisplayRole = Role;
export type UserStatus = 'ACTIVE' | 'INVITED' | 'INACTIVE';

export interface ConsoleUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: DisplayRole;
  status: UserStatus;
  isActive: boolean;
  createdAt: string | null;
  /** The account's registration/staff number; `null` when the account has none. */
  registrationNumber: string | null;
  /**
   * Managed department (design 2026-10-28 — PROPOSED ADR-11 reversal). The
   * nested reference is the ADR-16 workflow match key; `null` = unaffiliated.
   */
  department: DepartmentRef | null;
  /** Fixture-only relative label ("2 hours ago") — live rows show "—" . */
  lastLoginLabel?: string;
}

export interface UsersPage {
  items: ConsoleUser[];
  total: number;
  page: number;
  limit: number;
  /** True when the API was unreachable/drifted and fixtures are being shown. */
  usedFallback: boolean;
}

export interface ContactExtras {
  department: string | null;
  phone: string | null;
  address: string | null;
  portalLanguage: string | null;
}

export interface ThesisCard {
  code: string;
  badge: string;
  title: string;
  supervisor: string;
  updated: string;
}

export interface ActivityItem {
  iconKind: 'system' | 'upload' | 'approve';
  before?: string;
  strong: string;
  after?: string;
  when: string;
}

export interface Oversight {
  lastLogin: string;
  createdBy: string;
  permissions: string;
}

/**
 * Profile payload — live core + live project rails (engineering spec §16.3
 * "User details ✅"): `theses`/`milestones`/`activity` come from the bounded
 * `GET /projects?studentId=` fan-out; `oversight` rows that have no MVP
 * endpoint render honest em-dashes (§19.2 rejects AuditEvent).
 */
export interface UserDetail extends ConsoleUser {
  /** Always empty — no contact endpoint exists (parity §5.4 shows `—`). */
  extras: ContactExtras;
  theses: ThesisCard[];
  /** Sum of milestones across the student's projects (§16.3 rail). */
  milestones: number;
  activity: ActivityItem[];
  oversight: Oversight;
  /** Rail fan-out failed — cards render honest error copy, core stays. */
  railsError: boolean;
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** Required for students by the API; optional for supervisors. */
  registrationNumber?: string | null;
  /** Managed department; blank/absent = unaffiliated (ADR-16 default). */
  departmentId?: string | null;
}

export interface ImportRow {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** Required for student rows by the API; optional for supervisors. */
  registrationNumber?: string | null;
  /** CSV department NAME — the repo resolves it to an id before posting. */
  department?: string;
  /** Filled by `resolveImportDepartments`; never supplied by the CSV. */
  departmentId?: string | null;
}

export interface CreatedUser {
  user: ConsoleUser;
  status: UserStatus;
}

/** Partial `PATCH /users/:id` body — all keys optional; `null` clears a field. */
export interface UpdateUserInput {
  registrationNumber?: string | null;
  departmentId?: string | null;
}

export interface ImportResult {
  created: number;
}

export interface ListUsersArgs {
  q?: string;
  role?: Role;
  /** Exact state filter — maps to the API's `isActive=true|false`. */
  isActive?: boolean;
  /** Managed department filter. */
  departmentId?: string;
  /** Grandfathering banner: students with no registration number. */
  missingRegistrationNumber?: boolean;
  page: number;
  limit: number;
}

/**
 * Aggregate cards on /users — four live `limit=1` probes (Phase 14 fixture
 * rail: Students-page pattern; mockup numbers replaced by honest counts).
 */
export interface ConsoleStats {
  total: number;
  students: number;
  faculty: number;
  inactive: number;
  /** True when any probe failed — all four fall back to sample numbers. */
  usedFallback: boolean;
}
