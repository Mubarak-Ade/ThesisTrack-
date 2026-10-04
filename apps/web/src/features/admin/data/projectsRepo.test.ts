import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the real ApiError class; replace only the network surface.
vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/api/http';

import { countProjectsByStatus, listProjects, setProjectStatus } from './projectsRepo';

const get = vi.mocked(api.get);
const patch = vi.mocked(api.patch);

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  patch.mockReset();
});

const PROJECT = {
  id: 'p-1',
  title: 'Vision-based navigation',
  status: 'active',
  workflowId: 'wf-1',
  student: {
    firstName: 'Marcus',
    lastName: 'Holloway',
    email: 'm.holloway@university.edu',
  },
  createdAt: '2026-01-05T10:00:00.000Z',
  updatedAt: new Date('2026-02-01T10:00:00.000Z'),
};

const envelope = (projects: unknown[], total: number, page = 1) => ({
  projects,
  pagination: { page, limit: 10, total },
});

describe('listProjects (live-only)', () => {
  it('builds the list query and maps the student join + Date timestamps', async () => {
    get.mockResolvedValue(envelope([PROJECT], 23, 2));

    const page = await listProjects({ page: 2, limit: 10, status: 'completed', q: '  vision ' });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain('/projects?');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
    expect(url).toContain('status=completed');
    expect(url).toContain('q=vision'); // trimmed before the encode
    expect(page).toMatchObject({ total: 23, page: 2, limit: 10 });
    expect(page.items[0]).toMatchObject({
      title: 'Vision-based navigation',
      studentName: 'Marcus Holloway',
      studentEmail: 'm.holloway@university.edu',
      status: 'active',
      workflowId: 'wf-1',
      updatedAt: '2026-02-01T10:00:00.000Z', // Date object → ISO (Rule 2)
    });
  });

  it('omits status for "all" and q when blank', async () => {
    get.mockResolvedValue(envelope([], 0));

    await listProjects({ page: 1, limit: 10, status: 'all', q: '   ' });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).not.toContain('status=');
    expect(url).not.toContain('q=');
  });

  it('answers field drift honestly: unknown student and status', async () => {
    get.mockResolvedValue(
      envelope([{ id: 'p-2', title: 'Orphan row', status: 'weird-status' }], 1),
    );

    const page = await listProjects({ page: 1, limit: 10 });

    expect(page.items[0]).toMatchObject({
      studentName: 'Unknown student',
      studentEmail: '',
      status: 'active', // outside the enum → active, never a crash
      workflowId: null,
      createdAt: '',
    });
  });

  it('throws on structure drift (projects array missing) — ErrorState, not fixtures', async () => {
    get.mockResolvedValue({ unexpected: true });

    await expect(listProjects({ page: 1, limit: 10 })).rejects.toThrow(/array missing/);
  });
});

describe('countProjectsByStatus', () => {
  it('probes four limit=1 envelopes and maps their totals', async () => {
    get.mockImplementation((async (path: string) => {
      if (path.includes('status=active')) return { projects: [], pagination: { total: 12 } };
      if (path.includes('status=completed')) return { projects: [], pagination: { total: 5 } };
      if (path.includes('status=archived')) return { projects: [], pagination: { total: 3 } };
      return { projects: [], pagination: { total: 20 } };
    }) as never);

    const counts = await countProjectsByStatus();

    expect(counts).toEqual({ total: 20, active: 12, completed: 5, archived: 3 });
    const urls = get.mock.calls.map((call) => String(call[0]));
    expect(urls).toHaveLength(4);
    expect(urls.every((url) => url.includes('limit=1'))).toBe(true);
    expect(urls.some((url) => url.includes('status=active'))).toBe(true);
    expect(urls.some((url) => url.includes('status=completed'))).toBe(true);
    expect(urls.some((url) => url.includes('status=archived'))).toBe(true);
  });
});

describe('setProjectStatus (Flow H, §5.8)', () => {
  it('PATCHes {status} and maps the returned project envelope', async () => {
    patch.mockResolvedValue({ project: { ...PROJECT, status: 'archived' } });

    const row = await setProjectStatus('p-1', 'archived');

    expect(patch).toHaveBeenCalledWith('/projects/p-1', { status: 'archived' });
    expect(row).toMatchObject({ id: 'p-1', status: 'archived', studentName: 'Marcus Holloway' });
  });

  it('maps a bare project body too (no {project} wrapper)', async () => {
    patch.mockResolvedValue({ ...PROJECT, status: 'completed' });

    const row = await setProjectStatus('p-1', 'completed');

    expect(row.status).toBe('completed');
  });
});
