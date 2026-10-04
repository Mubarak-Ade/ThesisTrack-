/** Notification kinds — §8.9 `notification_type` members. */
export type NotificationKind =
  | 'assignment'
  | 'submission'
  | 'review'
  | 'feedback'
  | 'milestone'
  | 'general'
  | 'proposal'
  | 'deadline';

/** One bell row (§11.8) — `readAt: null` is unread (§15.4, no `isRead`). */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ListNotificationsArgs {
  page: number;
  limit: number;
  unreadOnly: boolean;
}

export interface NotificationsPage {
  items: AppNotification[];
  total: number;
  page: number;
  limit: number;
  /** True when fixtures answered (§10.4 — screen shows SampleDataBanner). */
  usedFallback: boolean;
}
