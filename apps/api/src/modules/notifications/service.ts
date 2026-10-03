import { NotFoundError } from '../../errors/index.js';
import { notify } from '../../lib/notify.js';
import type { ListNotificationsQuery } from './schema.js';
import * as repo from './repository.js';
import type { NotificationRow, NotificationView } from './types.js';

/** §15.2: "due_at within 72 h" — the materialisation window (task 7.4). */
const DEADLINE_WINDOW_MS = 72 * 60 * 60 * 1000;

const DUE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Task 7.4 — **compute on read** (the Phase 0 decision): whenever this user's
 * notifications are fetched, materialise a `deadline` row for every milestone
 * of theirs due within 72 h and not approved. No scheduler exists and none is
 * added (§15.1 scope: in-app, polling-driven).
 *
 * Idempotent, so a 30 s poll cannot refill the bell: a candidate is skipped
 * when a `deadline` row for it was created **within the milestone's current
 * window** (`created_at >= due_at − 72h`). A milestone whose `due_at` was
 * pushed back has no row in its new window, so it warns again as it
 * re-approaches — one row per (user, milestone, due window) as the plan
 * requires.
 */
async function materializeDeadlines(userId: string): Promise<void> {
  const candidates = await repo.findDeadlineCandidates(userId);
  if (candidates.length === 0) {
    return;
  }

  const windowStart = new Map(
    candidates.map((c) => [
      c.milestone.id,
      c.milestone.dueAt!.getTime() - DEADLINE_WINDOW_MS,
    ]),
  );
  const existing = await repo.findDeadlineRows(userId, [...windowStart.keys()]);
  const warnedInWindow = new Set(
    existing
      .filter((row) => {
        const start = row.resourceId ? windowStart.get(row.resourceId) : undefined;
        return start !== undefined && row.createdAt.getTime() >= start;
      })
      .map((row) => row.resourceId!),
  );

  for (const candidate of candidates) {
    if (warnedInWindow.has(candidate.milestone.id)) {
      continue;
    }
    await notify({
      userId,
      type: 'deadline',
      title: 'Deadline approaching',
      message: `"${candidate.milestone.title}" (${candidate.project.title}) is due ${
        candidate.milestone.dueAt ? DUE_FORMAT.format(candidate.milestone.dueAt) : ''
      }.`,
      resourceType: 'milestone',
      resourceId: candidate.milestone.id,
    });
  }
}

function toView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

/* --------------------------------------------------------------- service */

/** GET /notifications — own rows, `?unread=true&page&limit` (§11.8). */
export async function list(
  userId: string,
  query: ListNotificationsQuery,
): Promise<{ notifications: NotificationView[]; page: number; limit: number; total: number }> {
  await materializeDeadlines(userId);
  const unreadOnly = query.unread === 'true';
  const { rows, total } = await repo.listForUser(userId, {
    unreadOnly,
    page: query.page,
    limit: query.limit,
  });
  return { notifications: rows.map(toView), page: query.page, limit: query.limit, total };
}

/** GET /notifications/unread-count — own, after the same on-read materialise. */
export async function unreadCount(userId: string): Promise<number> {
  await materializeDeadlines(userId);
  return repo.countUnread(userId);
}

/**
 * POST /notifications/:notificationId/read — **own row or 404** (§11.8:
 * another user's row answers 404, never 403, so ids cannot be probed).
 * Repeating the call keeps the original `read_at`.
 */
export async function markRead(userId: string, notificationId: string): Promise<NotificationView> {
  const row = await repo.markRead(notificationId, userId);
  if (!row) {
    throw new NotFoundError('Notification');
  }
  return toView(row);
}

/** POST /notifications/read-all — own unread rows only; returns the count. */
export async function markAllRead(userId: string): Promise<number> {
  return repo.markAllRead(userId);
}
