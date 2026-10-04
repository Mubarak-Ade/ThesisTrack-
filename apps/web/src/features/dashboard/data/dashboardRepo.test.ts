import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboard } from './dashboardRepo';

vi.mock('@/lib/api/http', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const { api } = await import('@/lib/api/http');

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** ISO timestamp at `offsetMs` from now (positive = future). */
const at = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

type Routes = Record<string, unknown>;

function person(firstName: string, lastName: string): Record<string, unknown> {
  return {
    id: `u-${lastName.toLowerCase()}`,
    firstName,
    lastName,
    email: `${lastName.toLowerCase()}@test.local`,
  };
}

const PROJECTS = [
  { id: 'pr-1', title: 'Edge NN Optimization', status: 'active', student: person('Marcus', 'Holloway') },
  { id: 'pr-2', title: 'Credential Ledger', status: 'completed', student: person('Anita', 'Desai') },
  { id: 'pr-3', title: 'Campus IoT', status: 'archived', student: person('Liam', 'Connor') },
];

/** Every URL `getDashboard` may request in its default live run. */
function baseRoutes(): Routes {
  return {
    '/projects?page=1&limit=5': { projects: PROJECTS, pagination: { page: 1, limit: 5, total: 42 } },
    '/projects?page=1&limit=1': { projects: [], pagination: { total: 42 } },
    '/projects?page=1&limit=1&status=active': { projects: [], pagination: { total: 30 } },
    '/projects?page=1&limit=1&status=completed': { projects: [], pagination: { total: 9 } },
    '/projects?page=1&limit=1&status=archived': { projects: [], pagination: { total: 3 } },
    '/users?role=student&limit=1': { users: [person('Ada', 'Lovelace')], pagination: { total: 120 } },
    '/users?role=supervisor&limit=1': { users: [person('Elena', 'Rossi')], pagination: { total: 14 } },
    '/proposals?status=submitted&page=1&limit=1': { proposals: [], pagination: { total: 4 } },
    '/proposals?status=under_review&page=1&limit=1': { proposals: [], pagination: { total: 2 } },
    '/proposals?status=rejected&page=1&limit=1': { proposals: [], pagination: { total: 7 } },

    '/projects/pr-1/stages': {
      stages: [{ id: 's1' }],
      current: { id: 's2', position: 2, name: 'Literature Review', status: 'active' },
    },
    '/projects/pr-1/supervisor': {
      active: { id: 'a1', supervisor: person('Elena', 'Rossi') },
      history: [],
    },
    '/projects/pr-1/activity': { activity: [] },
    '/projects/pr-1/milestones': { milestones: [] },

    '/projects/pr-2/stages': { stages: [], current: null },
    '/projects/pr-2/supervisor': { active: null, history: [] },
    '/projects/pr-2/activity': { activity: [] },
    '/projects/pr-2/milestones': { milestones: [] },

    '/projects/pr-3/stages': {
      stages: [{ id: 's1' }],
      current: { id: 's3', position: 1, name: 'Methodology', status: 'active' },
    },
    '/projects/pr-3/supervisor': {
      active: { id: 'a3', supervisor: person('Sarah', 'Blake') },
      history: [],
    },
    '/projects/pr-3/activity': { activity: [] },
    '/projects/pr-3/milestones': { milestones: [] },
  };
}

function install(routes: Routes): void {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path in routes) return routes[path];
    throw new Error(`unexpected path ${path}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getDashboard — live path', () => {
  it('maps probes, rows and tasks with usedFallback false', async () => {
    install(baseRoutes());

    const data = await getDashboard();

    expect(data.usedFallback).toBe(false);
    expect(data.project).toEqual({ total: 42, active: 30, completed: 9, archived: 3 });
    expect(data.department).toEqual({ students: 120, faculty: 14, awaiting: 4 });
    expect(data.workspaceTotal).toBe(42);

    expect(data.workspace).toHaveLength(3);
    const [first, second, third] = data.workspace;
    expect(first).toEqual({
      id: 'pr-1',
      student: 'Marcus Holloway',
      project: 'Edge NN Optimization',
      phase: 'Literature Review',
      status: 'IN PROGRESS',
      supervisor: 'Elena Rossi',
    });
    expect(first.code).toBeUndefined(); // live rows carry no thesis code
    expect(second.phase).toBe('—');
    expect(second.supervisor).toBe('Unassigned');
    expect(third.status).toBe('ARCHIVED');

    const allowed = ['IN PROGRESS', 'PENDING REVIEW', 'DELAYED', 'COMPLETED', 'ARCHIVED'];
    for (const row of data.workspace) {
      expect(allowed).toContain(row.status);
    }

    expect(data.tasks.action.map((task) => task.title)).toEqual([
      'Review 4 submitted proposals',
      '2 proposals in review',
    ]);
    expect(data.tasks.critical).toMatchObject({
      dateEm: '7 rejected proposals',
      cta: 'Open Proposals →',
      to: '/proposals',
    });
    expect(data.quickActions.map((action) => action.to)).toEqual([
      '/users/new',
      '/assignments',
      '/projects',
      '/reports',
    ]);
  });

  it('parses each probe total into its own figure', async () => {
    install({
      ...baseRoutes(),
      '/projects?page=1&limit=1': { projects: [], pagination: { total: 11 } },
      '/projects?page=1&limit=1&status=active': { projects: [], pagination: { total: 22 } },
      '/projects?page=1&limit=1&status=completed': { projects: [], pagination: { total: 33 } },
      '/projects?page=1&limit=1&status=archived': { projects: [], pagination: { total: 44 } },
      '/users?role=student&limit=1': { users: [], pagination: { total: 55 } },
      '/users?role=supervisor&limit=1': { users: [], pagination: { total: 66 } },
      '/proposals?status=submitted&page=1&limit=1': { proposals: [], pagination: { total: 77 } },
      '/proposals?status=under_review&page=1&limit=1': { proposals: [], pagination: { total: 88 } },
      '/proposals?status=rejected&page=1&limit=1': { proposals: [], pagination: { total: 99 } },
    });

    const data = await getDashboard();

    expect(data.project).toEqual({ total: 11, active: 22, completed: 33, archived: 44 });
    expect(data.department).toEqual({ students: 55, faculty: 66, awaiting: 77 });
    expect(data.workspaceTotal).toBe(11);
    expect(data.tasks.action.map((task) => task.title)).toEqual([
      'Review 77 submitted proposals',
      '88 proposals in review',
    ]);
    expect(data.tasks.critical.dateEm).toBe('99 rejected proposals');
  });

  it('merges per-project activity newest-first, capped at four', async () => {
    install({
      ...baseRoutes(),
      '/projects/pr-1/activity': {
        activity: [
          { id: 'e1', at: at(-HOUR), kind: 'proposal.submitted', actor: null, summary: 'Edge NN submitted' },
          { id: 'e2', at: at(-5 * HOUR), kind: 'feedback.created', actor: null, summary: 'Feedback posted' },
        ],
      },
      '/projects/pr-2/activity': {
        activity: [
          { id: 'e3', at: at(-30 * 60_000), kind: 'milestone.completed', actor: null, summary: 'Ledger milestone done' },
          { id: 'e4', at: at(-10 * HOUR), kind: 'submission.reviewed', actor: null, summary: 'Chapter reviewed' },
        ],
      },
      '/projects/pr-3/activity': {
        activity: [
          { id: 'e5', at: at(-20 * HOUR), kind: 'stage.started', actor: null, summary: 'Methodology started' },
          { id: 'e6', at: at(-3 * DAY), kind: 'assignment.changed', actor: null, summary: 'Supervisor changed' },
        ],
      },
    });

    const data = await getDashboard();

    expect(data.activity).toHaveLength(4);
    expect(data.activity.map((item) => item.iconKind)).toEqual([
      'milestone',
      'proposal',
      'feedback',
      'feedback',
    ]);
    expect(data.activity.map((item) => item.strong)).toEqual([
      'Ledger milestone done',
      'Edge NN submitted',
      'Feedback posted',
      'Chapter reviewed',
    ]);
    for (const item of data.activity) {
      expect(item.when).toBeTruthy();
      expect(item.when).toBe(item.when.toUpperCase());
      expect(item).not.toHaveProperty('before');
      expect(item).not.toHaveProperty('after');
    }
  });

  it('classifies milestones: past due → OVERDUE, within seven days → UPCOMING', async () => {
    install({
      ...baseRoutes(),
      '/projects/pr-1/milestones': {
        milestones: [
          { id: 'm1', title: 'Ethics form', status: 'pending', dueAt: at(-2 * DAY), position: 0 },
          { id: 'm2', title: 'Chapter draft', status: 'in_progress', dueAt: at(3 * DAY), position: 1 },
          { id: 'm3', title: 'Far off', status: 'pending', dueAt: at(30 * DAY), position: 2 },
          { id: 'm4', title: 'Approved', status: 'approved', dueAt: at(-5 * DAY), position: 3 },
          { id: 'm5', title: 'No date', status: 'pending', dueAt: null, position: 4 },
          { id: 'm6', title: 'Submitted late', status: 'submitted', dueAt: at(-1 * DAY), position: 5 },
        ],
      },
    });

    const data = await getDashboard();

    expect(data.tasks.overdue).toEqual([
      { kind: 'OVERDUE', title: 'Ethics form — Edge NN Optimization', due: 'URGENT' },
      { kind: 'OVERDUE', title: 'Submitted late — Edge NN Optimization', due: 'URGENT' },
    ]);
    expect(data.tasks.upcoming).toHaveLength(1);
    expect(data.tasks.upcoming[0]).toMatchObject({
      kind: 'UPCOMING',
      title: 'Chapter draft — Edge NN Optimization',
    });
    expect(data.tasks.upcoming[0].due).toMatch(/^due in /);
    // Future-only, open-status-only: far-off / approved / undated never show.
    const titles = [...data.tasks.overdue, ...data.tasks.upcoming].map((task) => task.title);
    expect(titles.join(' ')).not.toContain('Far off');
    expect(titles.join(' ')).not.toContain('Approved');
    expect(titles.join(' ')).not.toContain('No date');
  });

  it('caps OVERDUE and UPCOMING at three, soonest first', async () => {
    install({
      ...baseRoutes(),
      '/projects/pr-1/milestones': {
        milestones: [
          ...[5, 4, 3, 2, 1].map((days, index) => ({
            id: `o-${days}`,
            title: `Overdue ${days}`,
            status: 'pending',
            dueAt: at(-days * DAY),
            position: index,
          })),
          ...[1, 2, 3, 4, 5].map((days, index) => ({
            id: `u-${days}`,
            title: `Upcoming ${days}`,
            status: 'pending',
            dueAt: at(days * DAY),
            position: index + 5,
          })),
        ],
      },
    });

    const data = await getDashboard();

    expect(data.tasks.overdue.map((task) => task.title)).toEqual([
      'Overdue 5 — Edge NN Optimization',
      'Overdue 4 — Edge NN Optimization',
      'Overdue 3 — Edge NN Optimization',
    ]);
    expect(data.tasks.upcoming.map((task) => task.title)).toEqual([
      'Upcoming 1 — Edge NN Optimization',
      'Upcoming 2 — Edge NN Optimization',
      'Upcoming 3 — Edge NN Optimization',
    ]);
  });

  it('shapes task copy from the proposal probes (plural, singular, honest zero)', async () => {
    install({
      ...baseRoutes(),
      '/proposals?status=submitted&page=1&limit=1': { proposals: [], pagination: { total: 1 } },
      '/proposals?status=under_review&page=1&limit=1': { proposals: [], pagination: { total: 0 } },
      '/proposals?status=rejected&page=1&limit=1': { proposals: [], pagination: { total: 1 } },
    });

    const one = await getDashboard();
    expect(one.tasks.action).toEqual([
      { kind: 'ACTION REQUIRED', title: 'Review 1 submitted proposal', due: 'Awaiting decision' },
    ]);
    expect(one.tasks.critical).toMatchObject({
      dateEm: '1 rejected proposal',
      bodyTail: ' — students must start a new submission.',
      to: '/proposals',
    });

    install({
      ...baseRoutes(),
      '/proposals?status=submitted&page=1&limit=1': { proposals: [], pagination: { total: 0 } },
      '/proposals?status=under_review&page=1&limit=1': { proposals: [], pagination: { total: 0 } },
      '/proposals?status=rejected&page=1&limit=1': { proposals: [], pagination: { total: 0 } },
    });

    const none = await getDashboard();
    expect(none.tasks.action).toEqual([]);
    expect(none.tasks.critical).toMatchObject({
      dateEm: '0 rejected proposals',
      bodyTail: ' — nothing needs a new submission right now.',
    });
  });
});

describe('getDashboard — fallback', () => {
  it('returns the fixture snapshot with usedFallback true when a request rejects', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));

    const data = await getDashboard();

    expect(data.usedFallback).toBe(true);
    expect(data.project).toEqual({ total: 86, active: 71, completed: 9, archived: 6 });
    expect(data.department).toEqual({ students: 120, faculty: 112, awaiting: 8 });
    expect(data.workspaceTotal).toBe(212);
    expect(data.workspace).toHaveLength(5);
    expect(data.workspace[0].code).toBe('TH-2024-001');
    expect(data.tasks.critical.cta).toBe('Assign Faculty Now →');
    expect(data.tasks.critical.to).toBe('/assignments');
    expect(data.activity).toHaveLength(3);
    expect(data.quickActions.map((action) => action.to)).toEqual([
      '/users/new',
      '/assignments',
      '/projects',
      '/reports',
    ]);
  });

  it('falls back on contract drift too (all-or-nothing, never a half screen)', async () => {
    install({
      ...baseRoutes(),
      // Probe answers without pagination.total — drift, not data.
      '/projects?page=1&limit=1': { projects: [] },
    });

    const data = await getDashboard();

    expect(data.usedFallback).toBe(true);
    expect(data.workspace).toHaveLength(5);
    expect(data.workspaceTotal).toBe(212);
  });
});
