import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the real ApiError class; replace only the network surface.
vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

import { api, ApiError } from '@/lib/api/http';

import { MOCK_USERS } from './mock/fixtures';
import {
  createUser,
  getStats,
  getUser,
  importUsers,
  listUsers,
  sendInvite,
  updateUser,
} from './usersRepo';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const MARCUS = MOCK_USERS[1]!;

describe('listUsers', () => {
  it('maps a live envelope and builds the pinned query string', async () => {
    get.mockResolvedValue({
      users: [{ id: 'u1', firstName: 'Ali', lastName: 'Z', email: 'a@x.edu', role: 'student', isActive: true }],
      pagination: { page: 2, limit: 20, total: 41 },
    });

    const page = await listUsers({
      q: 'ali z',
      role: 'student',
      isActive: true,
      departmentId: '00000000-0000-4000-8000-000000000101',
      missingRegistrationNumber: true,
      page: 2,
      limit: 20,
    });

    expect(page.usedFallback).toBe(false);
    expect(page.total).toBe(41);
    expect(page.items[0]).toMatchObject({ id: 'u1', status: 'ACTIVE', role: 'student' });
    const url = get.mock.calls[0]![0] as string;
    expect(url).toContain('/users?');
    expect(url).toContain('q=ali+z');
    expect(url).toContain('role=student');
    expect(url).toContain('isActive=true');
    expect(url).toContain('departmentId=00000000-0000-4000-8000-000000000101');
    expect(url).toContain('missingRegistrationNumber=true');
    expect(url).toContain('page=2');
  });

  it('falls back to filtered fixtures on structure drift', async () => {
    get.mockResolvedValue({ unexpected: true });

    const page = await listUsers({ q: 'rossi', page: 1, limit: 10 });

    expect(page.usedFallback).toBe(true);
    expect(page.total).toBe(1);
    expect(page.items[0]?.email).toBe('e.rossi@university.edu');
    expect(console.warn).toHaveBeenCalled();
  });

  it('falls back on network errors and applies filters + paging', async () => {
    get.mockRejectedValue(new Error('network down'));

    const page = await listUsers({ role: 'student', isActive: false, page: 1, limit: 10 });

    expect(page.usedFallback).toBe(true);
    expect(page.items.map((u) => u.email)).toEqual(['s.jenkins@student.edu', 'i.musa@student.edu']);
  });

  it('filters fallback fixtures by department and by a missing registration number', async () => {
    get.mockRejectedValue(new Error('network down'));

    const byDepartment = await listUsers({
      departmentId: '00000000-0000-4000-8000-000000000104',
      page: 1,
      limit: 50,
    });
    expect(byDepartment.items.every((u) => u.department?.name === 'Architecture')).toBe(true);

    const missing = await listUsers({ missingRegistrationNumber: true, page: 1, limit: 50 });
    expect(missing.items.length).toBeGreaterThan(0);
    expect(missing.items.every((u) => u.role === 'student' && u.registrationNumber === null)).toBe(true);
    expect(missing.items.map((u) => u.email)).toContain('s.jenkins@student.edu');
  });
});

describe('getStats', () => {
  it('probes four live totals (§16.3 stat cards)', async () => {
    get.mockImplementation(() =>
      Promise.resolve({ users: [], pagination: { page: 1, limit: 1, total: 7 } }),
    );

    const stats = await getStats();

    expect(stats).toEqual({ total: 7, students: 7, faculty: 7, inactive: 7, usedFallback: false });
    const urls = get.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      '/users?page=1&limit=1',
      '/users?role=student&limit=1',
      '/users?role=supervisor&limit=1',
      '/users?isActive=false&limit=1',
    ]);
  });

  it('falls back to the sample snapshot when a probe fails', async () => {
    get.mockRejectedValue(new Error('down'));

    const stats = await getStats();

    expect(stats).toEqual({ total: 1248, students: 842, faculty: 156, inactive: 4, usedFallback: true });
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('getUser', () => {
  const PROJECT_ID = 'aaaa1111-2222-4333-8444-555555555555';

  /** Route the profile core + the rail fan-out by URL. */
  function mockProfile(opts: { projects?: unknown[]; failRails?: boolean } = {}) {
    get.mockImplementation((path) => {
      if (path === `/users/${MARCUS.id}`) {
        return Promise.resolve({
          user: {
            id: MARCUS.id,
            firstName: 'Marcus',
            lastName: 'Holloway',
            email: 'm.holloway@student.edu',
            role: 'student',
            isActive: true,
            status: 'ACTIVE',
            createdAt: '2023-09-12T09:00:00.000Z',
          },
        });
      }
      if (opts.failRails) return Promise.reject(new Error('rails down'));
      if (path.startsWith('/projects?studentId=')) {
        return Promise.resolve({
          projects:
            opts.projects ??
            [{ id: PROJECT_ID, title: 'Edge Theses', status: 'active', updatedAt: '2026-10-01T10:00:00.000Z' }],
        });
      }
      if (path === `/projects/${PROJECT_ID}/supervisor`) {
        return Promise.resolve({ active: { supervisor: { firstName: 'Elena', lastName: 'Rossi' } } });
      }
      if (path === `/projects/${PROJECT_ID}/milestones`) {
        return Promise.resolve({ milestones: [{ id: 'm1' }, { id: 'm2' }] });
      }
      if (path === `/projects/${PROJECT_ID}/activity`) {
        return Promise.resolve({
          activity: [{ kind: 'submission.created', summary: 'Draft uploaded', at: '2026-10-01T10:00:00.000Z' }],
        });
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
  }

  it('maps live core plus the live project rails (§16.3)', async () => {
    mockProfile();

    const detail = await getUser(MARCUS.id);

    expect(detail?.code).toBe('USR-0000'); // live rows derive USR-XXXX from the id (§4)
    expect(detail?.railsError).toBe(false);
    expect(detail?.theses).toHaveLength(1);
    expect(detail?.theses[0]).toEqual({
      code: '#aaaa1111',
      badge: 'ACTIVE',
      title: 'Edge Theses',
      supervisor: 'Elena Rossi',
      updated: expect.any(String),
    });
    expect(detail?.milestones).toBe(2);
    expect(detail?.activity).toHaveLength(1);
    expect(detail?.activity[0]).toMatchObject({ iconKind: 'upload', strong: 'Draft uploaded' });
    // Honest oversight: no sign-in audit (§19.2), permissions derived from role.
    expect(detail?.oversight).toEqual({ lastLogin: '—', createdBy: '—', permissions: 'Student' });
    // No contact endpoint — extras always empty (parity §5.4 `—` rows).
    expect(detail?.extras.phone).toBeNull();
  });

  it('returns empty rails for a profile with no projects', async () => {
    mockProfile({ projects: [] });

    const detail = await getUser(MARCUS.id);

    expect(detail?.theses).toEqual([]);
    expect(detail?.milestones).toBe(0);
    expect(detail?.activity).toEqual([]);
    expect(detail?.railsError).toBe(false);
  });

  it('keeps the profile and flags railsError when the fan-out fails', async () => {
    mockProfile({ failRails: true });

    const detail = await getUser(MARCUS.id);

    expect(detail?.code).toBe('USR-0000');
    expect(detail?.railsError).toBe(true);
    expect(detail?.theses).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the fixture row for a known id when the API fails', async () => {
    get.mockRejectedValue(new ApiError({ status: 500, code: 'INTERNAL', message: 'boom' }));
    const detail = await getUser(MARCUS.id);
    expect(detail?.code).toBe('USR-9012');
    expect(detail?.railsError).toBe(true); // the fan-out failed with it
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null for unknown ids (honest not-found)', async () => {
    get.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'nope' }));
    expect(await getUser('99999999-9999-4999-8999-999999999999')).toBeNull();
  });
});

describe('writes', () => {
  it('createUser posts the registration number and department id, then maps the result', async () => {
    post.mockResolvedValue({ user: { ...MARCUS }, status: 'INVITED' });

    const created = await createUser({
      firstName: 'New',
      lastName: 'Student',
      email: 'new@student.edu',
      role: 'student',
      registrationNumber: ' CST/22/INF/00001 ',
      departmentId: ' 00000000-0000-4000-8000-000000000101 ',
    });

    expect(post).toHaveBeenCalledWith('/users', {
      firstName: 'New',
      lastName: 'Student',
      email: 'new@student.edu',
      role: 'student',
      registrationNumber: 'CST/22/INF/00001',
      departmentId: '00000000-0000-4000-8000-000000000101',
    });
    expect(created.status).toBe('INVITED');
    expect(created.user.email).toBe('m.holloway@student.edu');
  });

  it('createUser omits a blank department instead of sending an empty id', async () => {
    post.mockResolvedValue({ user: { ...MARCUS }, status: 'INVITED' });

    await createUser({
      firstName: 'New',
      lastName: 'Student',
      email: 'new@student.edu',
      role: 'supervisor',
      departmentId: '   ',
    });

    expect(post).toHaveBeenCalledWith('/users', {
      firstName: 'New',
      lastName: 'Student',
      email: 'new@student.edu',
      role: 'supervisor',
    });
  });

  it('createUser surfaces API errors instead of faking success (Rule 3)', async () => {
    post.mockRejectedValue(
      new ApiError({ status: 422, code: 'VALIDATION', message: 'Email already in use' }),
    );
    await expect(
      createUser({ firstName: 'A', lastName: 'B', email: 'taken@x.edu', role: 'student' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('sendInvite posts to the re-send endpoint', async () => {
    post.mockResolvedValue({ user: { ...MARCUS }, status: 'INVITED' });
    const result = await sendInvite(MARCUS.id);
    expect(post).toHaveBeenCalledWith(`/users/${MARCUS.id}/invite`);
    expect(result.status).toBe('INVITED');
  });

  it('importUsers resolves CSV department names against the managed list, then posts ids', async () => {
    get.mockResolvedValue({
      departments: [
        { id: 'dept-inf', name: 'Informatics', code: 'INF' },
        { id: 'dept-cyb', name: 'Cyber Security', code: 'CYB' },
      ],
      pagination: { page: 1, limit: 100, total: 2 },
    });
    post.mockResolvedValue({ created: 2, users: [] });

    const result = await importUsers([
      {
        firstName: 'A',
        lastName: 'One',
        email: 'one@x.edu',
        role: 'student',
        registrationNumber: 'CST/22/INF/00001',
        department: 'informatics', // case-insensitive
      },
      { firstName: 'B', lastName: 'Two', email: 'two@x.edu', role: 'supervisor' },
    ]);

    expect(get).toHaveBeenCalledWith('/departments?page=1&limit=100');
    expect(post).toHaveBeenCalledWith('/users/import', {
      users: [
        {
          firstName: 'A',
          lastName: 'One',
          email: 'one@x.edu',
          role: 'student',
          registrationNumber: 'CST/22/INF/00001',
          departmentId: 'dept-inf',
        },
        {
          firstName: 'B',
          lastName: 'Two',
          email: 'two@x.edu',
          role: 'supervisor',
        },
      ],
    });
    expect(result.created).toBe(2);
  });

  it('importUsers refuses an unknown department before posting any row', async () => {
    get.mockResolvedValue({
      departments: [{ id: 'dept-inf', name: 'Informatics', code: 'INF' }],
      pagination: { page: 1, limit: 100, total: 1 },
    });

    await expect(
      importUsers([
        { firstName: 'A', lastName: 'One', email: 'one@x.edu', role: 'supervisor', department: 'Robotics' },
        { firstName: 'B', lastName: 'Two', email: 'two@x.edu', role: 'supervisor', department: 'Informatics' },
      ]),
    ).rejects.toMatchObject({
      status: 422,
      details: [{ path: 'users[0].department', message: 'Unknown department "Robotics"' }],
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('importUsers rejects on 422 so the wizard can show row errors', async () => {
    get.mockResolvedValue({ departments: [], pagination: { page: 1, limit: 100, total: 0 } });
    post.mockRejectedValue(
      new ApiError({ status: 422, code: 'VALIDATION', message: '2 rows invalid', details: [{ row: 2 }] }),
    );
    await expect(importUsers([{ firstName: 'A', lastName: 'B', email: 'bad', role: 'student' }])).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('updateUser PATCHes { departmentId } and maps the row the server stored', async () => {
    patch.mockResolvedValue({ user: { ...MARCUS, department: { id: 'dept-dat', name: 'Data Science', code: 'DAT' } } });

    const updated = await updateUser(MARCUS.id, { departmentId: 'dept-dat' });

    expect(patch).toHaveBeenCalledWith(`/users/${MARCUS.id}`, { departmentId: 'dept-dat' });
    expect(updated.department).toEqual({ id: 'dept-dat', name: 'Data Science', code: 'DAT' });
    expect(updated.email).toBe('m.holloway@student.edu');
  });

  it('updateUser clears the department by sending null (unaffiliated)', async () => {
    patch.mockResolvedValue({ user: { ...MARCUS, department: null } });

    const updated = await updateUser(MARCUS.id, { departmentId: null });

    expect(patch).toHaveBeenCalledWith(`/users/${MARCUS.id}`, { departmentId: null });
    expect(updated.department).toBeNull();
  });

  it('updateUser surfaces PATCH errors instead of faking success (Rule 3)', async () => {
    patch.mockRejectedValue(
      new ApiError({ status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'Department code does not match' }),
    );
    await expect(updateUser(MARCUS.id, { departmentId: 'dept-x' })).rejects.toBeInstanceOf(ApiError);
  });
});
