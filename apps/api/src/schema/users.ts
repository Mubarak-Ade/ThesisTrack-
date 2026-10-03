import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
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
    // nullable — only students typically have one; null means "not on file"
    registrationNumber: varchar('registration_number', { length: 32 }),
    // Display-only string (ADR-11 — Department stays a rejected entity).
    // This is the key ADR-16's workflow auto-match reads at approval time:
    // student's program -> the one active workflow for that program -> the
    // flagged default -> no workflow (zero stages). Nullable: existing rows
    // and unaffiliated accounts carry none and fall back to the default.
    program: varchar('program', { length: 255 }),
    role: userRoleEnum('role').notNull().default('student'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_users_role').on(table.role)],
);

export const usersRelations = relations(users, ({ many }) => ({
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
