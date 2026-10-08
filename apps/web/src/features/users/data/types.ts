/**
 * Stable internal models for the console's user-management data (spec §4).
 * Screens consume these types only — raw API DTOs never leave `data/`.
 */

export type Role = 'student' | 'supervisor' | 'administrator';
/** `coordinator` exists only in display fixtures — the API cannot produce it. */
export type DisplayRole = Role | 'coordinator';
export type UserStatus = 'ACTIVE' | 'INVITED' | 'INACTIVE';

export interface ConsoleUser {
  id: string;
  /** Display code — fixtures pass theirs through; live rows derive `USR-XXXX` from the id (spec §4). */
  code?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: DisplayRole;
  status: UserStatus;
  isActive: boolean;
  createdAt: string | null;
  registrationNumber: string | null;
  /**
   * §11.0.2 PROPOSED delta — the ADR-16 workflow auto-match key. Absent from
   * older payloads/fixtures → mapped to `null` (unaffiliated: default workflow).
   */
  program: string | null;
  /** Fixture-only hints (department shown in tables/rails). */
  department?: string;
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
  /** UI-only — the API's create schema has no department field (§A). */
  department?: string;
  /** Optional §11.0.2 delta — blank/absent means unaffiliated (ADR-16 fallback). */
  program?: string | null;
}

export interface ImportRow {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  department?: string;
  /** Optional §11.0.2 delta — blank/absent means unaffiliated (ADR-16 fallback). */
  program?: string | null;
}

export interface CreatedUser {
  user: ConsoleUser;
  status: UserStatus;
}

/** Partial `PATCH /users/:id` body — §11.0.2 delta (`null` clears `program`). */
export interface UpdateUserInput {
  program: string | null;
}

export interface ImportResult {
  created: number;
}

export interface ListUsersArgs {
  q?: string;
  role?: Role;
  /** Exact state filter — maps to the API's `isActive=true|false`. */
  isActive?: boolean;
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
