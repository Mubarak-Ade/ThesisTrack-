import type { notifications } from '../../schema/index.js';

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationType = NotificationRow['type'];

/**
 * The API shape of a notification (§11.8). The row as stored — `readAt`
 * `null` means unread, which is what the unread count and `?unread=true`
 * filter on; there is no derived `isRead` field because §15.4 defines unread
 * purely in terms of `read_at`.
 */
export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: Date | null;
  createdAt: Date;
}
