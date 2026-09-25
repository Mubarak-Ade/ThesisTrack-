import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the real ApiError class; replace only the network surface.
vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

import { api, ApiError } from '@/lib/api/http';

import { MOCK_USERS } from './mock/fixtures';
import {
  createUser,
  getStats,
  getUser,
  importUsers,
  listSecurityLogs,
  listUsers,
  sendInvite,
} from './usersRepo';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  post.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const MARCUS = MOCK_USERS[1]!;

describe('listUsers', () => {
  it('maps a live envelope and builds the pinned query string', async () => {
    get.mockResolvedValue({
      users: [{ id: 'u1', firstName: 'Ali', lastName: 'Z', email: 'a@x.edu', role: 'student', isActive: true }],
      pagination: { page: 2, limit: 20, total: 41 },
    });

    const page = await listUsers({ q: 'ali z', role: 'student', isActive: true, page: 2, limit: 20 });

    expect(page.usedFallback).toBe(false);
    expect(page.total).toBe(41);
    expect(page.items[0]).toMatchObject({ id: 'u1', status: 'ACTIVE', role: 'student' });
    const url = get.mock.calls[0]![0] as string;
    expect(url).toContain('/users?');
    expect(url).toContain('q=ali+z');
    expect(url).toContain('role=student');
    expect(url).toContain('isActive=true');
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
});

describe('getStats', () => {
  it('uses the live total from a limit=1 probe', async () => {
    get.mockResolvedValue({ users: [], pagination: { page: 1, limit: 1, total: 3 } });
    const stats = await getStats();
    expect(stats.total).toBe(3);
    expect(stats.usedFallback).toBe(false);
    expect(stats.students).toBeGreaterThan(0); // non-endpoint stats stay fixture-backed
    expect(get.mock.calls[0]![0]).toContain('limit=1');
  });

  it('falls back to the fixture total when the probe fails', async () => {
    get.mockRejectedValue(new Error('down'));
    const stats = await getStats();
    expect(stats.usedFallback).toBe(true);
    expect(stats.total).toBe(1248);
  });
});

describe('getUser', () => {
  it('merges live core with fixture extras and rails', async () => {
    get.mockResolvedValue({
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

    const detail = await getUser(MARCUS.id);
    expect(detail?.extras.phone).toBe('+1 (555) 012-3456');
    expect(detail?.theses).toHaveLength(2);
    expect(detail?.audit.length).toBeGreaterThan(0);
    expect(detail?.code).toBeUndefined(); // live rows carry no fixture code
  });

  it('returns the fixture row for a known id when the API fails', async () => {
    get.mockRejectedValue(new ApiError({ status: 500, code: 'INTERNAL', message: 'boom' }));
    const detail = await getUser(MARCUS.id);
    expect(detail?.code).toBe('USR-9012');
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null for unknown ids (honest not-found)', async () => {
    get.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'nope' }));
    expect(await getUser('99999999-9999-4999-8999-999999999999')).toBeNull();
  });
});

describe('writes', () => {
  it('createUser posts the 4-field body (department dropped) and maps the result', async () => {
    post.mockResolvedValue({ user: { ...MARCUS }, status: 'INVITED' });

    const created = await createUser({
      firstName: 'New',
      lastName: 'Student',
      email: 'new@student.edu',
      role: 'student',
      department: 'Informatics',
    });

    expect(post).toHaveBeenCalledWith('/users', {
      firstName: 'New',
      lastName: 'Student',
      email: 'new@student.edu',
      role: 'student',
    });
    expect(created.status).toBe('INVITED');
    expect(created.user.email).toBe('m.holloway@student.edu');
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

  it('importUsers posts { users: [...] } and reads `created`', async () => {
    post.mockResolvedValue({ created: 2, users: [] });
    const result = await importUsers([
      { firstName: 'A', lastName: 'One', email: 'one@x.edu', role: 'student' },
      { firstName: 'B', lastName: 'Two', email: 'two@x.edu', role: 'supervisor', department: 'X' },
    ]);
    expect(post).toHaveBeenCalledWith('/users/import', {
      users: [
        { firstName: 'A', lastName: 'One', email: 'one@x.edu', role: 'student' },
        { firstName: 'B', lastName: 'Two', email: 'two@x.edu', role: 'supervisor' },
      ],
    });
    expect(result.created).toBe(2);
  });

  it('importUsers rejects on 422 so the wizard can show row errors', async () => {
    post.mockRejectedValue(
      new ApiError({ status: 422, code: 'VALIDATION', message: '2 rows invalid', details: [{ row: 2 }] }),
    );
    await expect(importUsers([{ firstName: 'A', lastName: 'B', email: 'bad', role: 'student' }])).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('listSecurityLogs', () => {
  it('returns the fixture rail', async () => {
    const logs = await listSecurityLogs();
    expect(logs).toHaveLength(4);
    expect(logs[0]).toMatchObject({ action: 'Password Reset', severity: 'ok' });
  });
});
