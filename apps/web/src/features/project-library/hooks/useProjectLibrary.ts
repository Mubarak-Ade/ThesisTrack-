import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  getLibraryProject,
  listLibrary,
} from '../data/projectLibraryRepo';
import type { LibraryFilters } from '../data/types';

const STALE_TIME = 30_000;

/** Institution-wide list. The filter object is part of the cache key. */
export function useProjectLibrary(filters: LibraryFilters) {
  return useQuery({
    queryKey: ['project-library', 'list', filters],
    queryFn: () => listLibrary(filters),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
}

export function useLibraryProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-library', 'detail', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('missing project id');
      return getLibraryProject(projectId);
    },
    enabled: !!projectId,
    staleTime: STALE_TIME,
  });
}
