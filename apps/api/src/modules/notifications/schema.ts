import { z } from 'zod';

import { paginationQuerySchema } from '../../validators/common.js';

/** `:notificationId` on `POST /notifications/:notificationId/read`. */
export const notificationParamsSchema = z.object({
  notificationId: z.string().uuid('Invalid notification id'),
});

/**
 * GET /notifications — §11.8 `?unread=true&page&limit`.
 *
 * `unread` is `true`/`false` literally as the spec spells it (a bare
 * `?unread` without a value is rejected by Express's parser shape anyway);
 * pagination defaults come from the shared schema (`page=1`, `limit=20`,
 * cap 100).
 */
export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unread: z.enum(['true', 'false']).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
