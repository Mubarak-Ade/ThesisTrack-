/**
 * Notifications repository (§11.8, §10.4):
 *  - reads  → live first, fixtures on any error/shape drift (`usedFallback`);
 *  - writes → always surface errors (Rule 3: never fake success).
 */
import { api } from '@/lib/api/http';
import { mapNotification, mapNotificationsPage } from './mappers';
import { NOTIFICATION_FIXTURES } from './mock/fixtures';
import type { AppNotification, ListNotificationsArgs, NotificationsPage } from './types';

function warn(scope: string, error: unknown): void {
  console.warn(`[notificationsRepo] ${scope}: using sample data —`, error);
}

function listQuery(args: ListNotificationsArgs): string {
  const params = new URLSearchParams({
    page: String(args.page),
    limit: String(args.limit),
  });
  if (args.unreadOnly) params.set('unread', 'true');
  return params.toString();
}

/** Fixture slice matching the same filters (unread = readAt null). */
function filterMock(args: ListNotificationsArgs): AppNotification[] {
  const rows = args.unreadOnly
    ? NOTIFICATION_FIXTURES.filter((row) => row.readAt === null)
    : NOTIFICATION_FIXTURES;
  const start = (args.page - 1) * args.limit;
  return rows.slice(start, start + args.limit);
}

export async function listNotifications(args: ListNotificationsArgs): Promise<NotificationsPage> {
  try {
    const page = mapNotificationsPage(
      await api.get<unknown>(`/notifications?${listQuery(args)}`),
      args,
    );
    return { ...page, usedFallback: false };
  } catch (error) {
    warn('listNotifications', error);
    const filtered = filterMock(args);
    return {
      items: filtered,
      total: filtered.length,
      page: args.page,
      limit: args.limit,
      usedFallback: true,
    };
  }
}

/** POST /notifications/:notificationId/read — 404s on someone else's row. */
export async function markRead(id: string): Promise<AppNotification> {
  const payload = await api.post<{ notification?: unknown }>(`/notifications/${id}/read`);
  const mapped = mapNotification(payload?.notification);
  if (!mapped) throw new Error('Malformed mark-read response');
  return mapped;
}

/** POST /notifications/read-all → count updated. */
export async function markAllRead(): Promise<number> {
  const payload = await api.post<{ updated?: unknown }>('/notifications/read-all');
  return typeof payload?.updated === 'number' ? payload.updated : 0;
}
