import { Router } from 'express';

import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { listNotificationsQuerySchema, notificationParamsSchema } from './schema.js';

const router = Router();

/*
 * §9.4 guard order: authenticate (global) → validate → controller. No
 * `requireRole` (every role reads their own bell) and no resource guard —
 * §11.8's "own rows only" is enforced by the service taking `req.user.id`
 * and by the repository putting it in every WHERE clause. Another user's row
 * therefore matches nothing → **404, not 403** (existence is masked, §13.5).
 *
 * §11.8's four endpoints:
 *   GET  /notifications                     → `?unread=true&page&limit`
 *   GET  /notifications/unread-count        → own
 *   POST /notifications/:notificationId/read → own (404 for anyone else's)
 *   POST /notifications/read-all            → own
 *
 * The two static POST paths are declared before the parameterised one
 * (Express matches in declaration order; they differ in segment count, but
 * the ordering documents the intent).
 */

router.get('/notifications', validate(listNotificationsQuerySchema, 'query'), controller.list);

router.get('/notifications/unread-count', controller.unreadCount);

router.post('/notifications/read-all', controller.markAllRead);

router.post(
  '/notifications/:notificationId/read',
  validate(notificationParamsSchema, 'params'),
  controller.markRead,
);

export default router;
