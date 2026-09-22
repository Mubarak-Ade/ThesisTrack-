import { Router } from 'express';

import { requireProjectAccess } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { projectIdParamsSchema } from './schema.js';

const router = Router();

/**
 * GET /projects/:projectId — canonical example of the authorization layers:
 *
 *   Authentication (global)  → who are you?          401 if no/invalid token
 *   RBAC (implicit — any role may attempt)
 *   Resource guard           → which resources?      403 unless owner, assigned
 *                                                   supervisor, or admin       404 if missing
 *   Controller
 */
router.get(
  '/projects/:projectId',
  validate(projectIdParamsSchema, 'params'),
  requireProjectAccess(),
  controller.show,
);

export default router;
