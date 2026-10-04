import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/api/http';

import {
  assignSupervisor,
  changeSupervisor,
  endSupervisor,
  getStudentAssignment,
  listStudents,
  listSupervisors,
} from './assignmentsRepo';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);
const del = vi.mocked(api.delete);

const STUDENT = {
  id: 's-1',
  firstName: 'Marcus',
  lastName: 'Holloway',
  email: 'm.holloway@university.edu',
  role: 'student',
  program: 'Informatics',
  isActive: true,
  createdAt: '2023-09-12T09:00:00.000Z',
};

const SUPERVISOR = {
  id: 'f-1',
  firstName: 'Elena',
  lastName: 'Rossi',
  email: 'e.rossi@university.edu',
  role: 'supervisor',
  isActive: true,
};

const ASSIGNMENT = {
  active: {
    id: 'a-1',
    projectId: 'p-9',
    isPrimary: true,
    assignedAt: new Date('2026-01-10T08:00:00.000Z'),
    endedAt: null,
    supervisor: SUPERVISOR,
  },
  history: [
    {
      id: 'a-0',
      projectId: null,
      isPrimary: true,
      assignedAt: '2025-09-01T08:00:00.000Z',
      endedAt: '2026-01-10T08:00:00.000Z',
      supervisor: { ...SUPERVISOR, id: 'f-2', firstName: ' Ana', lastName: 'Kovač' },
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe('directory pages (§11.0.2)', () => {
  it('listStudents pins role=student and passes page/limit/q', async () => {
    get.mockResolvedValue({
      users: [STUDENT],
      pagination: { page: 3, limit: 10, total: 41 },
    });

    const page = await listStudents({ page: 3, limit: 10, q: '  marc ' });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain('/users?');
    expect(url).toContain('role=student');
    expect(url).toContain('page=3');
    expect(url).toContain('limit=10');
    expect(url).toContain('q=marc');
    expect(page.total).toBe(41);
    expect(page.items[0]).toMatchObject({
      name: 'Marcus Holloway',
      program: 'Informatics',
      isActive: true,
    });
  });

  it('listSupervisors pins role=supervisor and omits an empty q', async () => {
    get.mockResolvedValue({ users: [SUPERVISOR], pagination: { page: 1, limit: 100, total: 7 } });

    const page = await listSupervisors({ page: 1, limit: 100, q: '  ' });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain('role=supervisor');
    expect(url).not.toContain('q=');
    expect(page.items[0]).toMatchObject({ name: 'Elena Rossi', isActive: true });
  });

  it('throws on structure drift — no fixture rows in a write-path screen', async () => {
    get.mockResolvedValue({ unexpected: true });

    await expect(listStudents({ page: 1, limit: 10 })).rejects.toThrow(/array missing/);
  });
});

describe('getStudentAssignment (Flow C read, §11.1)', () => {
  it('maps active + history, Date timestamps to ISO, and trims names', async () => {
    get.mockResolvedValue(ASSIGNMENT);

    const state = await getStudentAssignment('s-1');

    expect(get).toHaveBeenCalledWith('/students/s-1/supervisor');
    expect(state.active).toMatchObject({
      projectId: 'p-9',
      isPrimary: true,
      assignedAt: '2026-01-10T08:00:00.000Z',
      endedAt: null,
      supervisor: { name: 'Elena Rossi', isActive: true },
    });
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      endedAt: '2026-01-10T08:00:00.000Z',
      supervisor: { name: 'Ana Kovač' },
    });
  });

  it('answers null active and empty history for an unassigned student', async () => {
    get.mockResolvedValue({ active: null, history: [] });

    const state = await getStudentAssignment('s-2');

    expect(state).toEqual({ active: null, history: [] });
  });
});

describe('Flow C writes (§5.3)', () => {
  it('assign POSTs {supervisorId} then re-reads the student state', async () => {
    post.mockResolvedValue({});
    get.mockResolvedValue(ASSIGNMENT);

    const state = await assignSupervisor('s-1', 'f-1');

    expect(post).toHaveBeenCalledWith('/students/s-1/supervisor', { supervisorId: 'f-1' });
    // The write is confirmed by the follow-up read, not by the POST body.
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(get.mock.invocationCallOrder[0]!);
    expect(state.active?.supervisor.name).toBe('Elena Rossi');
  });

  it('change PATCHes {supervisorId} then re-reads (end-old + insert-new)', async () => {
    patch.mockResolvedValue({});
    get.mockResolvedValue(ASSIGNMENT);

    await changeSupervisor('s-1', 'f-1');

    expect(patch).toHaveBeenCalledWith('/students/s-1/supervisor', { supervisorId: 'f-1' });
    expect(patch.mock.invocationCallOrder[0]).toBeLessThan(get.mock.invocationCallOrder[0]!);
  });

  it('end DELETEs the student-scoped path then re-reads history', async () => {
    del.mockResolvedValue({});
    get.mockResolvedValue({ active: null, history: ASSIGNMENT.history });

    const state = await endSupervisor('s-1');

    expect(del).toHaveBeenCalledWith('/students/s-1/supervisor');
    expect(state.active).toBeNull();
    expect(state.history).toHaveLength(1); // history survives the end (I12)
  });

  it('propagates write errors — no silent success (Rule 3)', async () => {
    post.mockRejectedValue(new Error('409: student already has a supervisor'));

    await expect(assignSupervisor('s-1', 'f-1')).rejects.toThrow(/409/);
    expect(get).not.toHaveBeenCalled();
  });
});
