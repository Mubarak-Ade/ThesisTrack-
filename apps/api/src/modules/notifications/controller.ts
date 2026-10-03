import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type { ListNotificationsQuery } from './schema.js';
import * as service from './service.js';

/*
 * Thin handlers (§9.4: authenticate → validate → controller — notifications
 * have no resource guard because §11.8's scope **is** `req.user.id`: every
 * service call takes it from the token, and another user's row is a 404 by
 * construction, never a 403).
 */

// GET /notifications — own feed, `?unread=true&page&limit`.
export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListNotificationsQuery;
  const { notifications, page, limit, total } = await service.list(req.user!.id, query);
  respond(res, 200, { notifications, pagination: { page, limit, total } });
});

// GET /notifications/unread-count — the bell badge (§16.5).
export const unreadCount = asyncHandler(async (req, res) => {
  respond(res, 200, { unreadCount: await service.unreadCount(req.user!.id) });
});

// POST /notifications/:notificationId/read — own row only, else 404.
export const markRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params as { notificationId: string };
  respond(res, 200, { notification: await service.markRead(req.user!.id, notificationId) });
});

// POST /notifications/read-all — flips this user's unread rows, returns how many.
export const markAllRead = asyncHandler(async (req, res) => {
  respond(res, 200, { updated: await service.markAllRead(req.user!.id) });
});
