import { and, asc, count, desc, eq, exists, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';

import { db } from '../../config/db.js';
import {
  milestones,
  notifications,
  projects,
  supervisorAssignments,
} from '../../schema/index.js';
import type { NotificationRow } from './types.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * **Scoping invariant:** every read and write here takes `userId` as an
 * explicit parameter and includes it in the WHERE clause — a row can never be
 * reached without its owner's id, which is how §11.8's "own rows only" and
 * "another user's row → 404, not 403" become structural rather than
 * remembered. The insert path is `lib/notify.ts` (§15.4), not this file.
 */

/** Multi-statement units run inside the caller's transaction. */
export type WriteExecutor = Pick<typeof db, 'insert' | 'update'>;

/* ------------------------------------------------------------------ reads */

export async function listForUser(
  userId: string,
  opts: { unreadOnly: boolean; page: number; limit: number },
): Promise<{ rows: NotificationRow[]; total: number }> {
  const conditions = [eq(notifications.userId, userId)];
  if (opts.unreadOnly) {
    conditions.push(sql`${notifications.readAt} IS NULL`);
  }
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db.select({ value: count() }).from(notifications).where(where),
  ]);

  return { rows, total: totals[0]?.value ?? 0 };
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
  return row?.value ?? 0;
}

/* ----------------------------------------------------------------- writes */

/**
 * `POST /notifications/:id/read` — the WHERE clause carries both keys, so
 * another user's row matches nothing and the service answers **404** (§11.8:
 * 404, not 403 — existence is masked). `COALESCE` keeps the original
 * `read_at` on a repeat call, making the endpoint idempotent.
 */
export async function markRead(
  id: string,
  userId: string,
  executor: WriteExecutor = db,
): Promise<NotificationRow | undefined> {
  const [row] = await executor
    .update(notifications)
    .set({ readAt: sql`COALESCE(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  return row;
}

/** `POST /notifications/read-all` — returns how many rows this call flipped. */
export async function markAllRead(
  userId: string,
  executor: WriteExecutor = db,
): Promise<number> {
  const rows = await executor
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`))
    .returning({ id: notifications.id });
  return rows.length;
}

/* --------------------------------------------------- deadline (§15.2, 7.4) */

/** One milestone + its project, as needed to phrase the warning. */
export interface DeadlineCandidate {
  milestone: typeof milestones.$inferSelect;
  project: Pick<typeof projects.$inferSelect, 'id' | 'title'>;
}

/**
 * §15.2's deadline row: milestones **due within 72 hours** and not yet
 * approved, for the requesting user's projects — either as the owner student
 * or through an active supervision (`student_id` keyed, so a pre-project
 * assignment with `project_id IS NULL` still matches once its project exists).
 *
 * The window's lower bound is `now()`: §15.2 is "deadline *approaching*".
 * Overdue-but-unapproved milestones are a different (computed) state — §5.6's
 * `overdue`, surfaced by the milestone list and §16.5's chip — and a stale
 * project would otherwise spray permanent rows on first fetch.
 */
export function findDeadlineCandidates(userId: string): Promise<DeadlineCandidate[]> {
  return db
    .select({ milestone: milestones, project: { id: projects.id, title: projects.title } })
    .from(milestones)
    .innerJoin(projects, eq(milestones.projectId, projects.id))
    .where(
      and(
        ne(milestones.status, 'approved'),
        gte(milestones.dueAt, sql`now()`),
        lte(milestones.dueAt, sql`now() + interval '72 hours'`),
        or(
          eq(projects.studentId, userId),
          exists(
            db
              .select({ one: sql`1` })
              .from(supervisorAssignments)
              .where(
                and(
                  eq(supervisorAssignments.studentId, projects.studentId),
                  eq(supervisorAssignments.supervisorId, userId),
                  isNull(supervisorAssignments.endedAt),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(milestones.dueAt));
}

/**
 * Existing `deadline` rows for these milestones — the idempotency read for
 * task 7.4. The service keeps a row only if it was created **within the
 * milestone's current due window** (`created_at >= due_at − 72h`), so
 * polling never refills the bell while a rescheduled due date genuinely
 * enters a new window warns again.
 */
export function findDeadlineRows(
  userId: string,
  milestoneIds: string[],
): Promise<NotificationRow[]> {
  if (milestoneIds.length === 0) {
    return Promise.resolve([]);
  }
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'deadline'),
        inArray(notifications.resourceId, milestoneIds),
      ),
    );
}
