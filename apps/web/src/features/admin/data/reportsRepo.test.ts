import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/api/http';

import { buildReport, getReportCounts } from './reportsRepo';

const get = vi.mocked(api.get);

const PROJECT = {
  id: 'p-1',
  title: 'Vision-based navigation',
  status: 'active',
  student: { firstName: 'Marcus', lastName: 'Holloway', email: 'm@uni.edu' },
  createdAt: '2026-01-05T10:00:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
};

const STUDENT = {
  id: 's-1',
  firstName: 'Marcus',
  lastName: 'Holloway',
  email: 'm@uni.edu',
  role: 'student',
  program: 'Informatics',
  isActive: true,
  createdAt: '2023-09-12T09:00:00.000Z',
};

const userPage = (users: unknown[], total: number, limit = 100) => ({
  users,
  pagination: { page: 1, limit, total },
});

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
});

describe('getReportCounts (live probes)', () => {
  it('issues thirteen limit=1 probes and maps every headline number', async () => {
    const totals: Record<string, number> = {
      '/projects?page=1&limit=1': 20,
      '/projects?page=1&limit=1&status=active': 12,
      '/projects?page=1&limit=1&status=completed': 5,
      '/projects?page=1&limit=1&status=archived': 3,
      '/users?role=student&page=1&limit=1': 41,
      '/users?role=supervisor&page=1&limit=1': 7,
      '/proposals?page=1&limit=1': 30,
      '/proposals?status=draft&page=1&limit=1': 2,
      '/proposals?status=submitted&page=1&limit=1': 9,
      '/proposals?status=under_review&page=1&limit=1': 2,
      '/proposals?status=revision_required&page=1&limit=1': 0,
      '/proposals?status=approved&page=1&limit=1': 14,
      '/proposals?status=rejected&page=1&limit=1': 3,
    };
    get.mockImplementation((async (path: string) => {
      if (!(path in totals)) throw new Error(`unexpected GET ${path}`);
      return { projects: [], users: [], proposals: [], pagination: { total: totals[path] } };
    }) as never);

    const counts = await getReportCounts();

    expect(counts).toEqual({
      students: 41,
      faculty: 7,
      projectsTotal: 20,
      projectsActive: 12,
      projectsCompleted: 5,
      projectsArchived: 3,
      proposalsTotal: 30,
      proposalsDraft: 2,
      proposalsSubmitted: 9,
      proposalsUnderReview: 2,
      proposalsRevisionRequired: 0,
      proposalsApproved: 14,
      proposalsRejected: 3,
    });
    expect(get).toHaveBeenCalledTimes(13);
    expect(
      get.mock.calls.every((call) => String(call[0]).includes('limit=1')),
    ).toBe(true);
  });

  it('propagates failures — a report never invents numbers (LIVE-ONLY)', async () => {
    get.mockRejectedValue(new Error('network down'));

    await expect(getReportCounts()).rejects.toThrow(/network down/);
  });
});

describe('buildReport datasets', () => {
  it('projects: walks every page up to the total and carries the CSV headers', async () => {
    get.mockImplementation((async (path: string) => {
      if (path === '/projects?page=1&limit=100') {
        return {
          projects: Array.from({ length: 100 }, () => PROJECT),
          pagination: { page: 1, limit: 100, total: 150 },
        };
      }
      if (path === '/projects?page=2&limit=100') {
        return {
          projects: Array.from({ length: 50 }, () => PROJECT),
          pagination: { page: 2, limit: 100, total: 150 },
        };
      }
      throw new Error(`unexpected GET ${path}`);
    }) as never);

    const dataset = await buildReport('projects');

    expect(dataset.filename).toBe('thesistrack-projects.csv');
    expect(dataset.headers).toEqual([
      'Title',
      'Student',
      'Email',
      'Status',
      'Created',
      'Updated',
    ]);
    expect(dataset.rows).toHaveLength(150);
    expect(dataset.rows[0]).toEqual([
      'Vision-based navigation',
      'Marcus Holloway',
      'm@uni.edu',
      'active',
      '2026-01-05T10:00:00.000Z',
      '2026-02-01T10:00:00.000Z',
    ]);
    expect(dataset.note).toBeUndefined(); // total reached, nothing trimmed
  });

  it('projects: caps at 500 rows and says so honestly in the note', async () => {
    get.mockResolvedValue({
      projects: Array.from({ length: 100 }, () => PROJECT),
      pagination: { page: 1, limit: 100, total: 600 },
    });

    const dataset = await buildReport('projects');

    expect(get).toHaveBeenCalledTimes(5); // 5 × 100, then the cap stops the walk
    expect(dataset.rows).toHaveLength(500);
    expect(dataset.note).toMatch(/First 500 of 600 rows \(export cap 500\)/);
  });

  it('students: pins role=student and warns when the total exceeds the rows', async () => {
    get.mockResolvedValue(userPage([STUDENT], 40));

    const dataset = await buildReport('students');

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain('/users?role=student');
    expect(url).toContain('limit=100');
    expect(dataset.headers).toEqual(['Name', 'Email', 'Program', 'Account', 'Created']);
    expect(dataset.rows[0]).toEqual([
      'Marcus Holloway',
      'm@uni.edu',
      'Informatics',
      'active',
      '2023-09-12T09:00:00.000Z',
    ]);
    expect(dataset.note).toMatch(/First 1 of 40 rows/);
  });

  it('proposals: maps the student join and version into the row', async () => {
    get.mockResolvedValue({
      proposals: [
        {
          title: 'Edge SLAM',
          student: { firstName: 'Sarah', lastName: 'Jenkins', email: 's@uni.edu' },
          status: 'approved',
          version: 2,
          updatedAt: '2026-03-01T09:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 100, total: 1 },
    });

    const dataset = await buildReport('proposals');

    expect(dataset.headers).toEqual(['Title', 'Student', 'Email', 'Status', 'Version', 'Updated']);
    expect(dataset.rows[0]).toEqual([
      'Edge SLAM',
      'Sarah Jenkins',
      's@uni.edu',
      'approved',
      2,
      '2026-03-01T09:00:00.000Z',
    ]);
    expect(dataset.note).toBeUndefined();
  });

  it('assignments: fans one supervisor read out per student, honest Unassigned', async () => {
    get.mockImplementation((async (path: string) => {
      if (path === '/users?page=1&limit=500&role=student') {
        return userPage([STUDENT, { ...STUDENT, id: 's-2', email: 's2@uni.edu' }], 2, 500);
      }
      if (path === '/students/s-1/supervisor') {
        return {
          active: {
            id: 'a-1',
            projectId: null,
            isPrimary: true,
            assignedAt: '2026-01-10T08:00:00.000Z',
            endedAt: null,
            supervisor: {
              id: 'f-1',
              firstName: 'Elena',
              lastName: 'Rossi',
              email: 'e@uni.edu',
              isActive: true,
            },
          },
          history: [],
        };
      }
      if (path === '/students/s-2/supervisor') return { active: null, history: [] };
      throw new Error(`unexpected GET ${path}`);
    }) as never);

    const dataset = await buildReport('assignments');

    expect(dataset.headers).toEqual([
      'Student',
      'Email',
      'Program',
      'Active supervisor',
      'Supervisor email',
      'Assigned at',
    ]);
    expect(dataset.rows[0]).toEqual([
      'Marcus Holloway',
      'm@uni.edu',
      'Informatics',
      'Elena Rossi',
      'e@uni.edu',
      '2026-01-10T08:00:00.000Z',
    ]);
    expect(dataset.rows[1]).toEqual([
      'Marcus Holloway',
      's2@uni.edu',
      'Informatics',
      'Unassigned',
      '',
      '',
    ]);
    expect(dataset.note).toBeUndefined();
  });

  it('faculty: pins role=supervisor with the compact three-column header', async () => {
    get.mockResolvedValue(
      userPage(
        [
          {
            id: 'f-1',
            firstName: 'Elena',
            lastName: 'Rossi',
            email: 'e@uni.edu',
            role: 'supervisor',
            isActive: false,
          },
        ],
        1,
      ),
    );

    const dataset = await buildReport('faculty');

    expect(String(get.mock.calls[0]?.[0])).toContain('/users?role=supervisor');
    expect(dataset.headers).toEqual(['Name', 'Email', 'Account']);
    expect(dataset.rows[0]).toEqual(['Elena Rossi', 'e@uni.edu', 'inactive']);
  });
});
