import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the real ApiError class; replace only the network surface.
vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

import { api } from '@/lib/api/http';

import { getStudents } from './studentsRepo';

const get = vi.mocked(api.get);

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const USER_1 = {
  id: 'abcd1234-5678-49ab-cdef-000000000001',
  firstName: 'Marcus',
  lastName: 'Holloway',
  email: 'm.holloway@university.edu',
  role: 'student',
  program: 'Informatics',
  isActive: true,
  createdAt: '2023-09-12T09:00:00.000Z',
};

const USER_2 = {
  id: '9f8e7d6c-5b4a-4321-8901-000000000002',
  firstName: 'Sarah',
  lastName: 'Jenkins',
  email: 's.jenkins@university.edu',
  role: 'student',
  program: null,
  isActive: false,
  createdAt: 'not-a-date',
};

/** Route GETs by URL — the live board: page, projects, joins, stat probes. */
function routeLive(options: { projectStatus?: string } = {}): void {
  get.mockImplementation(((path: string) => {
    if (path.startsWith('/users?') && path.includes('limit=1')) {
      if (path.includes('isActive=true')) {
        return Promise.resolve({ users: [], pagination: { page: 1, limit: 1, total: 37 } });
      }
      return Promise.resolve({ users: [], pagination: { page: 1, limit: 1, total: 41 } });
    }
    if (path.startsWith('/users?')) {
      return Promise.resolve({
        users: [USER_1, USER_2],
        pagination: { page: 1, limit: 5, total: 41 },
      });
    }
    if (path.startsWith('/projects?limit=100')) {
      return Promise.resolve({
        projects: [
          { id: 'p-1', studentId: USER_1.id, status: options.projectStatus ?? 'active' },
        ],
      });
    }
    if (path.startsWith('/projects?status=active')) {
      return Promise.resolve({ projects: [], pagination: { page: 1, limit: 1, total: 12 } });
    }
    if (path.startsWith('/proposals?status=rejected')) {
      return Promise.resolve({ proposals: [], pagination: { page: 1, limit: 1, total: 3 } });
    }
    if (path === `/students/${USER_1.id}/supervisor`) {
      return Promise.resolve({
        active: { id: 'f-1', firstName: 'Elena', lastName: 'Rossi', isActive: true },
        history: [],
      });
    }
    if (path === `/students/${USER_2.id}/supervisor`) {
      return Promise.resolve({ active: null, history: [] });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  }) as never);
}

describe('getStudents (live)', () => {
  it('maps the live page: identity, program, status, thesis join and supervisor join', async () => {
    routeLive();
    const snap = await getStudents({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(false);
    expect(snap.total).toBe(41);
    expect(snap.infoCards).toHaveLength(3);
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows[0]).toMatchObject({
      name: 'Marcus Holloway',
      code: 'STU-ABCD', // derived: STU- + first 4 cleaned id chars (spec §4)
      email: 'm.holloway@university.edu',
      program: 'Informatics',
      status: 'Active',
      thesisStatus: 'IN PROGRESS',
      enrolledYear: 2023,
      supervisor: 'Elena Rossi',
    });
    expect(snap.rows[1]).toMatchObject({
      name: 'Sarah Jenkins',
      code: 'STU-9F8E',
      program: 'Unaffiliated',
      status: 'Inactive',
      thesisStatus: 'NO PROJECT',
      enrolledYear: null, // unreadable createdAt stays honest, never invented
      supervisor: 'Unassigned',
    });
  });

  it('builds the pinned query string (page/limit/q + role=student)', async () => {
    routeLive();
    await getStudents({ page: 2, limit: 5, q: 'marc hollow' });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain('/users?');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=5');
    expect(url).toContain('q=marc+hollow');
    expect(url).toContain('role=student');
  });

  it('fans the supervisor read out over the visible page rows only', async () => {
    routeLive();
    await getStudents({ page: 1, limit: 5 });

    const supervisorPaths = get.mock.calls
      .map((call) => String(call[0]))
      .filter((path) => path.includes('/supervisor'));
    expect(supervisorPaths).toEqual([
      `/students/${USER_1.id}/supervisor`,
      `/students/${USER_2.id}/supervisor`,
    ]);
  });

  it('maps archived projects to ARCHIVED and keeps missing ones as NO PROJECT', async () => {
    routeLive({ projectStatus: 'archived' });
    const snap = await getStudents({ page: 1, limit: 5 });
    expect(snap.rows[0]?.thesisStatus).toBe('ARCHIVED');
    expect(snap.rows[1]?.thesisStatus).toBe('NO PROJECT');
  });

  it('probes four limit=1 totals for the stat cards', async () => {
    routeLive();
    const snap = await getStudents({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(false);
    expect(snap.stats).toMatchObject({
      total: 41,
      activeStudents: 37,
      activeTheses: 12,
      atRisk: 3,
    });
    expect(snap.stats.activeThesesNote).toBe('Projects with status active');
    const urls = get.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/users?role=student&limit=1');
    expect(urls).toContain('/users?role=student&isActive=true&limit=1');
    expect(urls).toContain('/projects?status=active&limit=1');
    expect(urls).toContain('/proposals?status=rejected&limit=1');
  });
});

describe('getStudents (fixture fallback)', () => {
  it('returns a paged fixture snapshot with usedFallback on network errors', async () => {
    get.mockRejectedValue(new Error('network down'));

    const snap = await getStudents({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(true);
    expect(snap.rows).toHaveLength(5);
    expect(snap.total).toBe(12);
    expect(snap.stats.total).toBe(1240);
    expect(snap.stats.activeStudents).toBe(1180);
    expect(snap.stats.activeTheses).toBe(856);
    expect(snap.stats.atRisk).toBe(14);
    expect(snap.infoCards).toHaveLength(3);
    expect(console.warn).toHaveBeenCalled();
  });

  it('applies q + paging to the fixture rows', async () => {
    get.mockRejectedValue(new Error('down'));

    const search = await getStudents({ page: 1, limit: 5, q: 'jenkins' });
    expect(search.rows.map((row) => row.email)).toEqual(['s.jenkins@university.edu']);
    expect(search.total).toBe(1);

    const second = await getStudents({ page: 2, limit: 5 });
    expect(second.rows).toHaveLength(5);
    expect(second.rows[0]?.name).toBe('Yuki Tanaka');
    expect(second.total).toBe(12);
  });

  it('falls back on shape drift (users array missing)', async () => {
    get.mockResolvedValue({ unexpected: true });

    const snap = await getStudents({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(true);
    expect(snap.rows).toHaveLength(5);
    expect(console.warn).toHaveBeenCalled();
  });

  it('every info card declares exactly one action', async () => {
    get.mockRejectedValue(new Error('down'));

    const snap = await getStudents();
    for (const card of snap.infoCards) {
      expect(Number(Boolean(card.to)) + Number(Boolean(card.toast))).toBe(1);
    }
    expect(snap.infoCards[1]?.to).toBe('/users/import');
    expect(snap.infoCards[1]?.tone).toBe('blue');
  });

  it('fixture rows keep every mockup thesis status for the fallback badges', async () => {
    get.mockRejectedValue(new Error('down'));

    const snap = await getStudents({ page: 1, limit: 20 });
    const statuses = new Set(snap.rows.map((row) => row.thesisStatus));
    expect(statuses).toEqual(new Set(['IN PROGRESS', 'PROPOSED', 'DELAYED', 'COMPLETED']));
  });
});
