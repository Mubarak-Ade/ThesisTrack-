import { NotFoundError } from '../../errors/index.js';
import type { ProposalRow } from '../proposals/types.js';
import * as repo from './repository.js';
import type { LibraryFilters, LibraryRow, SimilarityCheckInput } from './types.js';
import type { ListLibraryQuery } from './schema.js';

/**
 * Project-library service — design 2026-11-05 (ADR-18).
 *
 * The repository owns SQL; this layer owns the product rules: the similar-list
 * cap, the source-text cap and the similarity floor. It also shapes the only
 * response object the API exposes (`LibraryRow`), so nothing else can leak a
 * raw row.
 */

const SIMILAR_DEFAULT = 5;
const SIMILAR_MAX = 10;

/** Below this combined score a "similar" row is noise, not a hint. */
const SIMILARITY_FLOOR = 0.12;

/** A long body/abstract produces an unhelpful AND tsquery; title + summary only. */
const SOURCE_CHAR_CAP = 1000;

function sourceText(title: string, summary: string): string {
  return `${title} ${summary}`.trim().slice(0, SOURCE_CHAR_CAP);
}

function dropBelowFloor(rows: LibraryRow[]): LibraryRow[] {
  return rows.filter((row) => (row.score ?? 0) >= SIMILARITY_FLOOR);
}

/** GET /project-library — page, total and the department facet. */
export async function listLibrary(query: ListLibraryQuery) {
  const filters: LibraryFilters = {
    page: query.page,
    limit: query.limit,
    status: query.status,
    q: query.q && query.q.length > 0 ? query.q : undefined,
    departmentId: query.departmentId,
  };

  const result = await repo.searchLibraryWithFacets(filters);

  return {
    projects: result.page.rows,
    departments: result.departments,
    pagination: { page: filters.page, limit: filters.limit, total: result.page.total },
  };
}

/** GET /project-library/:projectId — one row plus its closest neighbours. */
export async function getLibraryProject(projectId: string) {
  const project = await repo.getLibraryRow(projectId);
  if (!project) throw new NotFoundError('Project');

  const similarPage = await repo.searchLibrary({
    q: sourceText(project.title, project.description),
    status: 'all',
    page: 1,
    limit: SIMILAR_DEFAULT,
    excludeProjectId: project.id,
  });

  return { project, similar: dropBelowFloor(similarPage.rows) };
}

/** POST /project-library/similarity-check — read-only seam for a future form. */
export async function checkSimilarity(input: SimilarityCheckInput) {
  const page = await repo.searchLibrary({
    q: sourceText(input.title, input.description),
    status: 'all',
    page: 1,
    limit: SIMILAR_DEFAULT,
    excludeProjectId: input.excludeProjectId,
  });

  return { matches: dropBelowFloor(page.rows) };
}

/**
 * GET /proposals/:proposalId/similar-projects — the guard has already loaded
 * and authorised the proposal, so this never re-queries or widens access.
 * An approved proposal excludes its own project so it cannot match itself.
 */
export async function findSimilarForProposal(
  proposal: ProposalRow,
  limit: number = SIMILAR_DEFAULT,
) {
  const capped = Math.min(Math.max(limit, 1), SIMILAR_MAX);
  const page = await repo.searchLibrary({
    q: sourceText(proposal.title, proposal.abstract),
    status: 'all',
    page: 1,
    limit: capped,
    excludeProjectId: proposal.projectId ?? undefined,
  });

  return dropBelowFloor(page.rows);
}
