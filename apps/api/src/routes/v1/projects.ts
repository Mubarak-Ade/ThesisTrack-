import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import { requireProjectAccess, getProject } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import { projectIdParamsSchema } from '../../validators/projects.js';

const router = Router();

/**
 * GET /projects/:projectId — canonical example of the authorization layers:
 *
 *   Authentication (global)  → who are you?          401 if no/invalid token
 *   RBAC (implicit — any role may attempt)
 *   Resource guard           → which resources?      403 unless owner, assigned
 *                                                   supervisor, or admin       404 if missing
 *   Handler
 */
router.get(
  '/projects/:projectId',
  validate(projectIdParamsSchema, 'params'),
  requireProjectAccess(),
  asyncHandler(async (req, res) => {
    respond(res, 200, { project: getProject(req) });
  }),
);

export default router;
