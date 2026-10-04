/**
 * One mapper per API shape (§10.4 Rule 2): fields picked explicitly, drift
 * absorbed per row; the page envelope is strict so the repo can fall back.
 */
import type { AppNotification, ListNotificationsArgs, NotificationKind } from './types';

const KINDS: readonly string[] = [
  'assignment',
  'submission',
  'review',
  'feedback',
  'milestone',
  'general',
  'proposal',
  'deadline',
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asKind(value: unknown): NotificationKind {
  return KINDS.includes(typeof value === 'string' ? value : '') ? (value as NotificationKind) : 'general';
}

/** Row → AppNotification. Missing id/title → null (skipped by the page mapper). */
export function mapNotification(value: unknown): AppNotification | null {
  const r = asRecord(value);
  const id = nullableStr(r.id);
  const title = typeof r.title === 'string' ? r.title : null;
  if (!id || title === null) return null;
  return {
    id,
    kind: asKind(r.type ?? r.kind),
    title,
    message: nullableStr(r.message),
    resourceType: nullableStr(r.resourceType),
    resourceId: nullableStr(r.resourceId),
    readAt: nullableStr(r.readAt ?? r.read_at),
    createdAt: nullableStr(r.createdAt ?? r.created_at) ?? '',
  };
}

/** `{notifications, pagination}` envelope → page. Throws on structure drift. */
export function mapNotificationsPage(
  payload: unknown,
  args: ListNotificationsArgs,
): { items: AppNotification[]; total: number; page: number; limit: number } {
  const r = asRecord(payload);
  const list = r.notifications;
  if (!Array.isArray(list)) throw new Error('notifications envelope missing');
  const items = list
    .map(mapNotification)
    .filter((entry): entry is AppNotification => entry !== null);
  const pagination = asRecord(r.pagination);
  const total = typeof pagination.total === 'number' ? pagination.total : items.length;
  return {
    items,
    total,
    page: typeof pagination.page === 'number' ? pagination.page : args.page,
    limit: typeof pagination.limit === 'number' ? pagination.limit : args.limit,
  };
}
