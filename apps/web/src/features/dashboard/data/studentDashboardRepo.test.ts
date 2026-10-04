import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getStudentDashboard } from './studentDashboardRepo';

vi.mock('@/lib/api/http', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const { api } = await import('@/lib/api/http');

const USER = '11111111-1111-4111-8111-111111111111';

function live(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '/students/11111111-1111-4111-8111-111111111111/supervisor': {
      active: {
        supervisor: { firstName: 'Helen', lastName: 'Brooks', email: 'h.brooks@test.local' },
      },
      history: [],
    },
    '/proposals?page=1&limit=50': { proposals: [], pagination: {} },
    '/projects?page=1&limit=50': { projects: [], pagination: {} },
    ...overrides,
  };
}

function install(routes: Record<string, unknown>): void {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path in routes) return routes[path];
    throw new Error(`unexpected path ${path}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getStudentDashboard', () => {
  it('combines the three reads into a resolved state', async () => {
    install(
      live({
        '/proposals?page=1&limit=50': {
          proposals: [
            { id: 'p-1', title: 'Ledger', status: 'submitted', updatedAt: '2026-10-01T00:00:00.000Z' },
          ],
        },
      }),
    );

    const dash = await getStudentDashboard(USER);
    expect(dash.state.state).toBe(2);
    expect(dash.state.supervisor?.lastName).toBe('Brooks');
    expect(dash.usedFallback).toBe(false);
    expect(dash.reviewComment).toBeNull();
    expect(dash.milestones).toEqual([]);
  });

  it('State 0 — a null active assignment means unassigned', async () => {
    install(live({ '/students/11111111-1111-4111-8111-111111111111/supervisor': { active: null, history: [] } }));

    const dash = await getStudentDashboard(USER);
    expect(dash.state.state).toBe(0);
  });

  it('falls back to the fixture scenario when the primary reads fail', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));

    const dash = await getStudentDashboard(USER);
    expect(dash.usedFallback).toBe(true);
    expect(dash.state.supervisor?.firstName).toBe('Helen');
  });

  it('drops malformed proposal rows instead of crashing the state machine', async () => {
    install(
      live({
        '/proposals?page=1&limit=50': {
          proposals: [
            { id: 'p-1', title: 'ok', status: 'draft', updatedAt: '2026-10-01T00:00:00.000Z' },
            { title: 'no id', status: 'draft' },
            { id: 'p-3', title: 'bad status', status: 'wat', updatedAt: '' },
          ],
        },
      }),
    );

    const dash = await getStudentDashboard(USER);
    expect(dash.state.state).toBe(1);
    expect(dash.state.hasDraft).toBe(true);
    expect(dash.state.proposal?.id).toBe('p-1');
  });

  it('State 3/4 extras: latest review comment, failure tolerated', async () => {
    const routes = live({
      '/proposals?page=1&limit=50': {
        proposals: [
          {
            id: 'p-1',
            title: 'Ledger',
            status: 'revision_required',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
    });
    install(routes);
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/proposals/p-1/reviews') {
        return { reviews: [{ comment: 'Narrow the scope.' }, { comment: 'Older note.' }] };
      }
      if (path in routes) return routes[path];
      throw new Error(`unexpected path ${path}`);
    });

    const dash = await getStudentDashboard(USER);
    expect(dash.state.state).toBe(3);
    expect(dash.reviewComment).toBe('Narrow the scope.');

    // The extras are best-effort: a failing reviews call degrades the quote,
    // not the dashboard.
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/proposals/p-1/reviews') throw new Error('boom');
      if (path in routes) return routes[path];
      throw new Error(`unexpected path ${path}`);
    });
    const degraded = await getStudentDashboard(USER);
    expect(degraded.state.state).toBe(3);
    expect(degraded.reviewComment).toBeNull();
  });

  it('State 5 loads the project milestones that feed §5.6 progress', async () => {
    install(
      live({
        '/proposals?page=1&limit=50': {
          proposals: [
            { id: 'p-1', title: 'Ledger', status: 'approved', updatedAt: '2026-10-01T00:00:00.000Z' },
          ],
        },
        '/projects?page=1&limit=50': {
          projects: [{ id: 'pr-1', title: 'Ledger', status: 'active' }],
        },
      }),
    );
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/projects/pr-1/milestones') {
        return {
          milestones: [
            { id: 'm1', title: 'Proposal', status: 'approved', dueAt: null, position: 0 },
            { id: 'm2', title: 'Build', status: 'pending', dueAt: null, position: 1 },
          ],
        };
      }
      const routes = live({
        '/proposals?page=1&limit=50': {
          proposals: [
            {
              id: 'p-1',
              title: 'Ledger',
              status: 'approved',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        },
        '/projects?page=1&limit=50': {
          projects: [{ id: 'pr-1', title: 'Ledger', status: 'active' }],
        },
      });
      if (path in routes) return routes[path];
      throw new Error(`unexpected path ${path}`);
    });

    const dash = await getStudentDashboard(USER);
    expect(dash.state.state).toBe(5);
    expect(dash.milestones).toHaveLength(2);
  });
});
