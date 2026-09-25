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
  /** Mockup-style display code — fixtures only; live rows show the email alone. */
  code?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: DisplayRole;
  status: UserStatus;
  isActive: boolean;
  createdAt: string | null;
  registrationNumber: string | null;
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

export interface AuditRow {
  action: string;
  ip: string;
  at: string;
  outcome: 'SUCCESS' | 'WARNING';
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

/** Profile payload: live core + rails/extras that have no endpoint (spec §5.4). */
export interface UserDetail extends ConsoleUser {
  extras: ContactExtras;
  theses: ThesisCard[];
  audit: AuditRow[];
  activity: ActivityItem[];
  oversight: Oversight;
}

export interface SecurityLog {
  id: string;
  action: string;
  target: string;
  actor: string;
  when: string;
  severity: 'ok' | 'warn' | 'danger';
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** UI-only — the API's create schema has no department field (§A). */
  department?: string;
}

export interface ImportRow {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  department?: string;
}

export interface CreatedUser {
  user: ConsoleUser;
  status: UserStatus;
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

/** Aggregate cards on /users (spec §4: total is live when obtainable). */
export interface ConsoleStats {
  total: number;
  students: number;
  faculty: number;
  alerts: number;
  totalDelta: string;
  engagement: string;
  facultyNote: string;
  alertsNote: string;
  usedFallback: boolean;
}
