import { getProject } from '../../authz/index.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type {
  CreateProjectInput,
  ListProjectsQuery,
  PatchProjectInput,
  ProjectIdParams,
} from './schema.js';
import * as service from './service.js';

// GET /projects — scoped list: own / assigned / all (§11.2).
export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListProjectsQuery;
  const { projects, total } = await service.listProjectsFor(req.user!, query);
  respond(res, 200, {
    projects,
    pagination: { page: query.page, limit: query.limit, total },
  });
});

// POST /projects — admin manual creation; ADR-16 resolution runs either way.
export const create = asyncHandler(async (req, res) => {
  const input = req.body as CreateProjectInput;
  const project = await service.createProject(req.user!.id, input);
  respond(res, 201, { project });
});

// GET /projects/:projectId — the resource guard has already loaded and
// authorized the project; the handler only builds the response.
export const show = asyncHandler(async (req, res) => {
  respond(res, 200, { project: getProject(req) });
});

// PATCH /projects/:projectId — admin metadata/status edit (§11.2).
export const patch = asyncHandler(async (req, res) => {
  const input = req.body as PatchProjectInput;
  const project = await service.patchProject(getProject(req), input);
  respond(res, 200, { project });
});

// GET /projects/:projectId/activity — derived feed (§11.13, no event table).
export const activity = asyncHandler(async (req, res) => {
  const { projectId } = req.params as ProjectIdParams;
  respond(res, 200, { activity: await service.getActivityFeed(projectId) });
});
