import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/api/http';

import { createDepartment, getDepartment, listDepartments, updateDepartment } from './departmentsRepo';
import { mapDepartmentRef } from './mappers';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);

const ROW = {
  id: 'dept-1',
  name: 'Software Engineering',
  code: 'SWE',
  archived: false,
  archivedAt: null,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-03-01T09:00:00.000Z',
  activeWorkflow: { id: 'wf-1', name: 'BSc Software Engineering' },
  studentCount: 12,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listDepartments', () => {
  it('asks for active rows by default and maps the envelope', async () => {
    get.mockResolvedValue({
      departments: [ROW],
      pagination: { page: 1, limit: 100, total: 1 },
    } as never);

    const page = await listDepartments();

    expect(get).toHaveBeenCalledWith('/departments?page=1&limit=100');
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: 'dept-1',
      name: 'Software Engineering',
      code: 'SWE',
      archived: false,
      studentCount: 12,
      activeWorkflow: { id: 'wf-1', name: 'BSc Software Engineering' },
    });
  });

  it('sends the administrator views as the strings the API parses', async () => {
    get.mockResolvedValue({ departments: [], pagination: { page: 2, limit: 10, total: 0 } } as never);

    await listDepartments({ includeArchived: true, missingCode: true, page: 2, limit: 10 });

    expect(get).toHaveBeenCalledWith(
      '/departments?page=2&limit=10&includeArchived=true&missingCode=true',
    );
  });

  it('throws on structure drift so the screen can surface an error', async () => {
    get.mockResolvedValue({ rows: [] } as never);
    await expect(listDepartments()).rejects.toThrow(/departments/);
  });
});

describe('writes', () => {
  it('POST /departments sends the body and maps the created row', async () => {
    post.mockResolvedValue({ department: ROW } as never);

    const created = await createDepartment({ name: 'Software Engineering', code: 'SWE' });

    expect(post).toHaveBeenCalledWith('/departments', {
      name: 'Software Engineering',
      code: 'SWE',
    });
    expect(created.id).toBe('dept-1');
  });

  it('PATCH /departments/:id sends only the provided keys', async () => {
    patch.mockResolvedValue({
      department: {
        ...ROW,
        archived: true,
        archivedAt: '2026-03-02T00:00:00.000Z',
        activeWorkflow: null,
      },
    } as never);

    const updated = await updateDepartment('dept-1', { archived: true });

    expect(patch).toHaveBeenCalledWith('/departments/dept-1', { archived: true });
    expect(updated.archived).toBe(true);
    expect(updated.activeWorkflow).toBeNull();
  });

  it('GET /departments/:id maps detail and rejects a missing envelope', async () => {
    get.mockResolvedValueOnce({ department: ROW } as never);
    expect((await getDepartment('dept-1')).code).toBe('SWE');

    get.mockResolvedValueOnce({} as never);
    await expect(getDepartment('dept-1')).rejects.toThrow(/department/);
  });
});

describe('mapDepartmentRef — the nested reference on user rows', () => {
  it('maps id/name/code and tolerates a legacy row without a code', () => {
    expect(mapDepartmentRef({ id: 'd1', name: 'Informatics', code: 'INF' })).toEqual({
      id: 'd1',
      name: 'Informatics',
      code: 'INF',
    });
    expect(mapDepartmentRef({ id: 'd2', name: 'Legacy', code: null })).toEqual({
      id: 'd2',
      name: 'Legacy',
      code: null,
    });
  });

  it('returns null for an unaffiliated account or a malformed field', () => {
    expect(mapDepartmentRef(null)).toBeNull();
    expect(mapDepartmentRef(undefined)).toBeNull();
    expect(mapDepartmentRef('Informatics')).toBeNull();
    expect(mapDepartmentRef({ name: 'No id' })).toBeNull();
  });
});
