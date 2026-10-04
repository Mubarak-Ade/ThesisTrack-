import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/api/http';

import { getMonitoring } from './monitoringRepo';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);
const del = vi.mocked(api.delete);

const PROJECT_1 = {
  id: 'p-1',
  title: 'Vision-based navigation',
  status: 'active',
  student: { firstName: 'Marcus', lastName: 'Holloway', email: 'm@uni.edu' },
  createdAt: '2026-01-05T10:00:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
};

const PROJECT_2 = {
  id: 'p-2',
  title: 'Federated learning baseline',
  status: 'completed',
  student: { firstName: 'Sarah', lastName: 'Jenkins', email: 's@uni.edu' },
  createdAt: '2026-01-06T10:00:00.000Z',
  updatedAt: '2026-02-02T10:00:00.000Z',
};

const stageItem = (id: string, at: string) => ({
  id,
  at,
  kind: 'stage.completed',
  actor: { name: 'Elena Rossi' },
  summary: `${id} done`,
});

/** Route every GET the monitor makes: 4 probes + 1 page + per-row fan-out. */
function route({ activity = true }: { activity?: boolean } = {}): void {
  get.mockImplementation((async (path: string) => {
    if (path === '/projects?page=1&limit=1') return { projects: [], pagination: { total: 2 } };
    if (path === '/projects?page=1&limit=1&status=active') {
      return { projects: [], pagination: { total: 1 } };
    }
    if (path === '/projects?page=1&limit=1&status=completed') {
      return { projects: [], pagination: { total: 1 } };
    }
    if (path === '/projects?page=1&limit=1&status=archived') {
      return { projects: [], pagination: { total: 0 } };
    }
    if (path === '/projects?page=1&limit=8') {
      return { projects: [PROJECT_1, PROJECT_2], pagination: { page: 1, limit: 8, total: 2 } };
    }
    if (path === '/projects/p-1/stages') {
      return { stages: [], current: { name: 'Implementation', position: 3 } };
    }
    if (path === '/projects/p-2/stages') {
      return { stages: [], current: null };
    }
    if (path === '/projects/p-1/activity') {
      return { activity: [stageItem('a-1', '2026-03-02T10:00:00.000Z')] };
    }
    if (path === '/projects/p-2/activity') {
      if (!activity) return { unexpected: true }; // structure drift: `activity` array missing
      return { activity: [] };
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  }) as never);
}

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe('getMonitoring (§4.6 read-only)', () => {
  it('maps counters and rows, fanning out tracker + activity over visible rows only', async () => {
    route();

    const summary = await getMonitoring();

    expect(summary.counts).toEqual({ total: 2, active: 1, completed: 1, archived: 0 });
    expect(summary.projects).toEqual([
      {
        id: 'p-1',
        title: 'Vision-based navigation',
        studentName: 'Marcus Holloway',
        status: 'active',
        currentStage: 'Implementation',
        currentStagePosition: 3,
      },
      {
        id: 'p-2',
        title: 'Federated learning baseline',
        studentName: 'Sarah Jenkins',
        status: 'completed',
        currentStage: null,
        currentStagePosition: null,
      },
    ]);

    // Bounded fan-out: exactly two reads per visible row, nothing beyond page 1.
    const fanOut = get.mock.calls
      .map((call) => String(call[0]))
      .filter((path) => path.includes('/stages') || path.includes('/activity'));
    expect(fanOut).toEqual([
      '/projects/p-1/stages',
      '/projects/p-1/activity',
      '/projects/p-2/stages',
      '/projects/p-2/activity',
    ]);
  });

  it('never writes — the guardrail is enforced by the repo itself', async () => {
    route();

    await getMonitoring();

    expect(post).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('merges stage.* activity newest-first and caps the feed at 12', async () => {
    // 8 stage events per project, hours 01..08 on two days → 16 raw items.
    const early = Array.from({ length: 8 }, (_, i) =>
      stageItem(`e-${i}`, `2026-03-01T0${i + 1}:00:00.000Z`),
    );
    const late = Array.from({ length: 8 }, (_, i) =>
      stageItem(`l-${i}`, `2026-03-02T0${i + 1}:00:00.000Z`),
    );
    get.mockImplementation((async (path: string) => {
      if (path === '/projects/p-1/activity') return { activity: early };
      if (path === '/projects/p-2/activity') return { activity: late };
      if (path === '/projects?page=1&limit=8') {
        return { projects: [PROJECT_1, PROJECT_2], pagination: { page: 1, limit: 8, total: 2 } };
      }
      if (path === '/projects/p-1/stages') return { stages: [], current: null };
      if (path === '/projects/p-2/stages') return { stages: [], current: null };
      return { projects: [], pagination: { total: 0 } }; // the four probes
    }) as never);

    const summary = await getMonitoring();

    expect(summary.feed).toHaveLength(12); // 16 raw → capped
    expect(summary.feed[0]?.id).toBe('l-7'); // newest hour first
    expect(summary.feed[11]?.id).toBe('e-4'); // indices 8..11 keep e-7…e-4 (hour 05)
  });

  it('filters out non-stage activity kinds (only stage.* reaches this screen)', async () => {
    get.mockImplementation((async (path: string) => {
      if (path === '/projects/p-1/activity') {
        return {
          activity: [
            { id: 'x-1', at: '2026-03-03T00:00:00.000Z', kind: 'submission.created', summary: 'S' },
            stageItem('a-2', '2026-03-02T00:00:00.000Z'),
            { id: 'x-2', at: '2026-03-04T00:00:00.000Z', kind: 'stage.started', summary: 'Begun' },
          ],
        };
      }
      if (path === '/projects/p-2/activity') return { activity: [] };
      if (path === '/projects?page=1&limit=8') {
        return { projects: [PROJECT_1], pagination: { page: 1, limit: 8, total: 1 } };
      }
      if (path === '/projects/p-1/stages') return { stages: [], current: null };
      return { projects: [], pagination: { total: 0 } };
    }) as never);

    const summary = await getMonitoring();

    expect(summary.feed.map((item) => item.id)).toEqual(['x-2', 'a-2']); // submission dropped
  });

  it('throws on activity drift — fabricated oversight data is unacceptable', async () => {
    route({ activity: false });

    await expect(getMonitoring()).rejects.toThrow(/array missing/);
  });
});
