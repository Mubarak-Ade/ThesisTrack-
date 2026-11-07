import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkSimilarity,
  getLibraryProject,
  listLibrary,
} from './projectLibraryRepo';

vi.mock('@/lib/api/http', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    details?: unknown;
    constructor(init: { status: number; code: string; message: string; details?: unknown }) {
      super(init.message);
      this.status = init.status;
      this.code = init.code;
      this.details = init.details;
    }
  }
  return {
    ApiError,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

const { api, ApiError } = await import('@/lib/api/http');

const ROW = {
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listLibrary', () => {
  it('builds the query and maps the page', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      projects: [ROW],
      departments: [{ id: 'dept-1', name: 'Informatics', count: 1 }],
      pagination: { page: 1, limit: 10, total: 1 },
    });

    const page = await listLibrary({
      page: 1,
      limit: 10,
      status: 'all',
      q: '  ledger  ',
      departmentId: 'dept-1',
    });

    expect(api.get).toHaveBeenCalledWith(
      '/project-library?page=1&limit=10&departmentId=dept-1&q=ledger',
    );
    expect(page.items[0].id).toBe('project-1');
    expect(page.departments[0].count).toBe(1);
  });

  it('omits status=all and an empty q', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ projects: [], pagination: {} });
    await listLibrary({ page: 2, limit: 10, status: 'all', q: '   ' });
    expect(api.get).toHaveBeenCalledWith('/project-library?page=2&limit=10');
  });

  it('passes a real status through', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ projects: [], pagination: {} });
    await listLibrary({ page: 1, limit: 5, status: 'archived' });
    expect(api.get).toHaveBeenCalledWith('/project-library?page=1&limit=5&status=archived');
  });

  it('is live-only: a failure surfaces instead of fake rows', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'));
    await expect(listLibrary({ page: 1, limit: 10, status: 'all' })).rejects.toThrow('offline');
  });
});

describe('getLibraryProject', () => {
  it('returns the mapped detail', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ project: ROW, similar: [ROW] });
    const detail = await getLibraryProject('project-1');
    expect(detail?.project.id).toBe('project-1');
    expect(detail?.similar).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith('/project-library/project-1');
  });

  it('returns null for a real 404 and rethrows other failures', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Missing' }),
    );
    await expect(getLibraryProject('missing')).resolves.toBeNull();

    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'));
    await expect(getLibraryProject('project-1')).rejects.toThrow('offline');
  });

  it('throws on a malformed detail envelope', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ similar: [ROW] });
    await expect(getLibraryProject('project-1')).rejects.toThrow('Malformed');
  });
});

describe('similarity check API seam', () => {
  it('posts a similarity check', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ matches: [ROW] });
    const input = { title: 'Ledger', description: 'Description.' };
    const matches = await checkSimilarity(input);
    expect(matches).toHaveLength(1);
    expect(api.post).toHaveBeenCalledWith('/project-library/similarity-check', input);
  });
});
