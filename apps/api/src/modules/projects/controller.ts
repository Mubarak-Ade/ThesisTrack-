import { getProject } from '../../authz/index.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';

// GET /projects/:projectId — the resource guard has already loaded and
// authorized the project; the handler only builds the response.
export const show = asyncHandler(async (req, res) => {
  respond(res, 200, { project: getProject(req) });
});
