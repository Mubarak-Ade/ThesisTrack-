import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  check,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { userRoleEnum } from './enums.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    // null until an invited user activates their account and sets a password
    passwordHash: text('password_hash'),
    // Required for students (enforced by the API schema); supervisors may
    // optionally carry one. Nullable at the DB level so legacy rows and
    // non-student accounts that have none remain valid. Uniqueness is
    // case-insensitive system-wide (index below, design 2026-10-28).
    registrationNumber: varchar('registration_number', { length: 32 }),
    // Managed department (design 2026-10-28) — replaces the free-text
    // `department` and `program` strings. NULL = unaffiliated (ADR-16 fallback).
    departmentId: uuid('department_id').references((): AnyPgColumn => departments.id, {
      onDelete: 'restrict',
    }),
    role: userRoleEnum('role').notNull().default('student'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_role').on(table.role),
    // Coordinator invariant (design 2026-11-02, ADR-17): a department-scoped
    // coordinator is impossible without a department. The service gives the
    // friendly error; this constraint is the last line.
    check(
      'users_coordinator_department',
      sql`role <> 'coordinator' OR department_id IS NOT NULL`,
    ),
    // Scoped-list support: every coordinator query filters on both columns.
    index('idx_users_department_role').on(table.departmentId, table.role),
    // One account per registration number, system-wide, case-insensitive
    // (design 2026-10-28). Partial: legacy rows without a number never collide.
    uniqueIndex('users_registration_number_unique')
      .on(sql`lower(${table.registrationNumber})`)
      .where(sql`registration_number is not null`),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(sessions),
  accountTokens: many(accountTokens),
  projects: many(projects),
  supervisorAssignments: many(supervisorAssignments),
  submissions: many(submissions),
  submissionVersions: many(submissionVersions),
  reviews: many(reviews),
  feedback: many(feedback),
  notifications: many(notifications),
  // §3.4 — workflows this account configured (created_by, SET NULL on delete)
  workflowsCreated: many(workflows),
  // Managed department (design 2026-10-28) — the ADR-16 match key.
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
}));

import { sessions } from './sessions.js';
import { accountTokens } from './account-tokens.js';
import { projects } from './projects.js';
import { supervisorAssignments } from './supervisor-assignments.js';
import { submissions } from './submissions.js';
import { submissionVersions } from './submission-versions.js';
import { reviews } from './reviews.js';
import { feedback } from './feedback.js';
import { notifications } from './notifications.js';
import { workflows } from './workflows.js';
import { departments } from './departments.js';
