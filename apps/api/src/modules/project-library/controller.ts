import { asyncHandler } from '../../lib/async-handler.js';
import { respond } from '../../lib/response.js';
import type { ListLibraryQuery, ProjectLibraryParams, SimilarityCheckBody } from './schema.js';
import * as service from './service.js';

// GET /project-library — institution-wide, read-only (ADR-18).
export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListLibraryQuery;
  respond(res, 200, await service.listLibrary(query));
});

// GET /project-library/:projectId — the projection plus its similar rows.
export const show = asyncHandler(async (req, res) => {
  const { projectId } = req.params as ProjectLibraryParams;
  respond(res, 200, await service.getLibraryProject(projectId));
});

// POST /project-library/similarity-check — read-only seam, no screen in v1.
export const similarityCheck = asyncHandler(async (req, res) => {
  const body = req.body as SimilarityCheckBody;
  respond(res, 200, await service.checkSimilarity(body));
});
