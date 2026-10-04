import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the real ApiError class; replace only the network surface.
vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

import { api } from '@/lib/api/http';

import { getFaculty } from './facultyRepo';

const get = vi.mocked(api.get);

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const SUPERVISOR_1 = {
  id: 'f00d1234-5678-49ab-cdef-000000000001',
  firstName: 'Elena',
  lastName: 'Rossi',
  email: 'e.rossi@university.edu',
  role: 'supervisor',
  program: 'Informatics',
  isActive: true,
  createdAt: '2022-08-15T09:00:00.000Z',
};

const SUPERVISOR_2 = {
  id: 'cafe5678-1234-4def-8901-000000000002',
  firstName: 'Thomas',
  lastName: 'Miller',
  email: 't.miller@university.edu',
  role: 'supervisor',
  program: null,
  isActive: false,
  createdAt: '2019-06-17T09:00:00.000Z',
};

const SUPERVISOR_3 = {
  id: 'beef9876-4321-4abc-9def-000000000003',
  firstName: 'Sarah',
  lastName: 'Blake',
  email: 's.blake@university.edu',
  role: 'supervisor',
  program: 'Informatics',
  isActive: true,
  createdAt: '2021-03-04T09:00:00.000Z',
};

/** Route GETs by URL — the live board: supervisor page + four stat probes. */
function routeLive(): void {
  get.mockImplementation(((path: string) => {
    if (path.startsWith('/users?') && path.includes('limit=1')) {
      const total = path.includes('isActive=true')
        ? 15
        : path.includes('role=supervisor')
          ? 18
          : 41; // role=student probe
      return Promise.resolve({ users: [], pagination: { page: 1, limit: 1, total } });
    }
    if (path.startsWith('/users?')) {
      return Promise.resolve({
        users: [SUPERVISOR_1, SUPERVISOR_2, SUPERVISOR_3],
        pagination: { page: 1, limit: 5, total: 18 },
      });
    }
    if (path.startsWith('/proposals?status=submitted')) {
      return Promise.resolve({ proposals: [], pagination: { page: 1, limit: 1, total: 7 } });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  }) as never);
}

describe('getFaculty (live)', () => {
  it('maps the live page: identity, program, account status, null load fields', async () => {
    routeLive();
    const snap = await getFaculty({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(false);
    expect(snap.total).toBe(18);
    expect(snap.rows).toHaveLength(3);
    expect(snap.rows[0]).toEqual({
      name: 'Elena Rossi',
      code: 'FAC-F00D', // derived: FAC- + first 4 cleaned id chars (spec §4)
      email: 'e.rossi@university.edu',
      program: 'Informatics',
      workloadStudents: null, // §4.5 — no workload endpoint
      capacity: null,
      avgProgress: null,
      status: 'ACTIVE',
      lastActivity: null, // no activity endpoint
    });
    expect(snap.rows[1]).toMatchObject({
      name: 'Thomas Miller',
      code: 'FAC-CAFE',
      program: 'Unaffiliated',
      status: 'INACTIVE',
    });
  });

  it('builds the pinned query string (page/limit/q + role=supervisor)', async () => {
    routeLive();
    await getFaculty({ page: 3, limit: 5, q: 'rossi' });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain('/users?');
    expect(url).toContain('page=3');
    expect(url).toContain('limit=5');
    expect(url).toContain('q=rossi');
    expect(url).toContain('role=supervisor');
  });

  it('derives the program distribution from the visible page rows', async () => {
    routeLive();
    const snap = await getFaculty({ page: 1, limit: 5 });

    expect(snap.distribution).toEqual([
      { program: 'Informatics', supervisors: 2 },
      { program: 'Unaffiliated', supervisors: 1 },
    ]);
    expect(snap.distribution.reduce((n, entry) => n + entry.supervisors, 0)).toBe(
      snap.rows.length,
    );
  });

  it('returns honest live empties: no alerts, §4.5 system notice, fixture tools', async () => {
    routeLive();
    const snap = await getFaculty({ page: 1, limit: 5 });

    expect(snap.alerts).toEqual([]);
    expect(snap.systemNotice).toContain('no MVP endpoint');
    expect(snap.systemNotice).toContain('§4.5');
    expect(snap.adminTools).toHaveLength(3);
  });

  it('probes four limit=1 totals for the stat cards', async () => {
    routeLive();
    const snap = await getFaculty({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(false);
    expect(snap.stats).toMatchObject({
      total: 18,
      activeSupervisors: 15,
      students: 41,
      pending: 7,
    });
    expect(snap.stats.pendingNote).toBe('Proposals with status submitted');
    const urls = get.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/users?role=supervisor&limit=1');
    expect(urls).toContain('/users?role=supervisor&isActive=true&limit=1');
    expect(urls).toContain('/users?role=student&limit=1');
    expect(urls).toContain('/proposals?status=submitted&limit=1');
  });
});

describe('getFaculty (fixture fallback)', () => {
  it('returns the fixture snapshot with usedFallback on network errors', async () => {
    get.mockRejectedValue(new Error('network down'));

    const snap = await getFaculty({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(true);
    expect(snap.rows).toHaveLength(5); // page 1 of 8 fixture rows
    expect(snap.total).toBe(8);
    expect(snap.stats.total).toBe(42);
    expect(snap.stats.activeSupervisors).toBe(38);
    expect(snap.stats.students).toBe(212);
    expect(snap.stats.pending).toBe(14);
    expect(snap.alerts).toHaveLength(2);
    expect(snap.systemNotice).toContain('Fall Allocation');
    expect(console.warn).toHaveBeenCalled();
  });

  it('distribution adds up to the advertised supervisor total', async () => {
    get.mockRejectedValue(new Error('down'));

    const snap = await getFaculty();
    const sum = snap.distribution.reduce((n, entry) => n + entry.supervisors, 0);
    expect(sum).toBe(snap.stats.total);
  });

  it('applies q + paging to the fixture rows', async () => {
    get.mockRejectedValue(new Error('down'));

    const search = await getFaculty({ page: 1, limit: 5, q: 'blake' });
    expect(search.rows.map((row) => row.email)).toEqual(['s.blake@university.edu']);
    expect(search.total).toBe(1);

    const second = await getFaculty({ page: 2, limit: 5 });
    expect(second.rows).toHaveLength(3); // 8 fixture rows → page 2 holds the rest
    expect(second.rows[0]?.name).toBe('Prof. Daniel Okafor');
    expect(second.total).toBe(8);
  });

  it('falls back on shape drift (users array missing)', async () => {
    get.mockResolvedValue({ unexpected: true });

    const snap = await getFaculty({ page: 1, limit: 5 });

    expect(snap.usedFallback).toBe(true);
    expect(snap.rows).toHaveLength(5);
    expect(console.warn).toHaveBeenCalled();
  });

  it('every admin tool declares exactly one action', async () => {
    get.mockRejectedValue(new Error('down'));

    const snap = await getFaculty();
    expect(snap.adminTools).toHaveLength(3);
    for (const tool of snap.adminTools) {
      expect(Number(Boolean(tool.to)) + Number(Boolean(tool.toast))).toBe(1);
    }
    expect(snap.adminTools[0]?.to).toBe('/users/import');
  });
});
