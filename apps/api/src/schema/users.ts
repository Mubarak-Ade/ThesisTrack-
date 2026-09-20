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
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('student'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_users_role').on(table.role)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  projects: many(projects),
  supervisorAssignments: many(supervisorAssignments),
  submissions: many(submissions),
  submissionVersions: many(submissionVersions),
  reviews: many(reviews),
  feedback: many(feedback),
  notifications: many(notifications),
}));

import { sessions } from './sessions.js';
import { projects } from './projects.js';
import { supervisorAssignments } from './supervisor-assignments.js';
import { submissions } from './submissions.js';
import { submissionVersions } from './submission-versions.js';
import { reviews } from './reviews.js';
import { feedback } from './feedback.js';
import { notifications } from './notifications.js';
