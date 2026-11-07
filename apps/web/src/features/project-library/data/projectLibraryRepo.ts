/**
 * Project-library repository (ADR-18).
 *
 * Live-only by design: unlike the proposals list there is no fixture fallback.
 * Inventing project history would defeat the feature's purpose — duplicate
 * detection must reflect the real institution corpus or say it cannot.
 */
import { ApiError, api } from '@/lib/api/http';

import {
  mapLibraryDetail,
  mapLibraryPage,
  mapSimilarMatches,
} from './mappers';
import type {
  LibraryDetail,
  LibraryFilters,
  LibraryPage,
  SimilarityCheckInput,
  SimilarMatch,
} from './types';

function listQuery(filters: LibraryFilters): string {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  const q = filters.q?.trim();
  if (q && q.length > 0) params.set('q', q);
  return params.toString();
}

export async function listLibrary(filters: LibraryFilters): Promise<LibraryPage> {
  const payload = await api.get<unknown>(`/project-library?${listQuery(filters)}`);
  return mapLibraryPage(payload, filters);
}

/** `null` = genuinely not found (404); every other failure surfaces. */
export async function getLibraryProject(projectId: string): Promise<LibraryDetail | null> {
  try {
    const payload = await api.get<unknown>(`/project-library/${projectId}`);
    const detail = mapLibraryDetail(payload);
    if (!detail) throw new Error('Malformed project-library detail response');
    return detail;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * API seam for a future manual create/edit form. No screen calls it in v1;
 * it is exposed so the capability exists without a second corpus path.
 */
export async function checkSimilarity(
  input: SimilarityCheckInput,
): Promise<SimilarMatch[]> {
  const payload = await api.post<unknown>('/project-library/similarity-check', input);
  return mapSimilarMatches(payload);
}
