import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getLibraryProject,
  listLibrary,
} from '../data/projectLibraryRepo';
import type { LibraryFilters, LibraryRow } from '../data/types';
import {
  useLibraryProject,
  useProjectLibrary,
} from './useProjectLibrary';

vi.mock('../data/projectLibraryRepo', () => ({
  getLibraryProject: vi.fn(),
  listLibrary: vi.fn(),
}));

const ROW: LibraryRow = {
  id: 'project-1',
  title: 'Ledger',
  description: 'Description.',
  status: 'active',
  session: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  student: { id: 'student-1', firstName: 'Ola', lastName: 'Nordmann' },
  department: null,
  supervisors: [],
  score: null,
  excerpt: null,
};

const FILTERS: LibraryFilters = { page: 1, limit: 10, status: 'all' };

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProjectLibrary', () => {
  it('keys the cache by filters and uses a 30 s stale time', async () => {
    vi.mocked(listLibrary).mockResolvedValue({
      items: [ROW],
      total: 1,
      page: 1,
      limit: 10,
      departments: [],
    });
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useProjectLibrary(FILTERS), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = client.getQueryCache().find({
      queryKey: ['project-library', 'list', FILTERS],
    });
    expect(query).toBeDefined();
    expect((query!.options as { staleTime?: number }).staleTime).toBe(30_000);
    expect(listLibrary).toHaveBeenCalledWith(FILTERS);
  });
});

describe('useLibraryProject', () => {
  it('is disabled without an id', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useLibraryProject(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getLibraryProject).not.toHaveBeenCalled();
  });

  it('loads with the detail key when an id is present', async () => {
    vi.mocked(getLibraryProject).mockResolvedValue({ project: ROW, similar: [] });
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useLibraryProject('project-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      client.getQueryCache().find({
        queryKey: ['project-library', 'detail', 'project-1'],
      }),
    ).toBeDefined();
  });
});

