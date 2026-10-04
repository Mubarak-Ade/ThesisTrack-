import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/api/http';

import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  patchWorkflow,
} from './workflowsRepo';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);
const del = vi.mocked(api.delete);

const SUMMARY = {
  id: 'wf-1',
  name: 'BSc Software Engineering',
  program: 'Informatics',
  academicSession: '2026/2027',
  description: 'Six-stage pipeline',
  isDefault: true,
  archivedAt: null,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: new Date('2026-03-01T09:00:00.000Z'),
};

const STAGE = {
  id: 'st-1',
  position: 1,
  name: 'Proposal approval',
  description: null,
  dueOffsetDays: 14,
  deliverable: 'Proposal PDF',
  responsibleRole: 'supervisor',
  requiresSubmission: true,
  requiresReview: true,
  requiresApproval: true,
};

const detail = (workflow: Record<string, unknown> = SUMMARY) => ({
  workflow,
  stages: [STAGE],
});

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe('listWorkflows', () => {
  it('builds the query: program trimmed only when present, includeArchived opt-in', async () => {
    get.mockResolvedValue({ workflows: [SUMMARY], pagination: { page: 1, limit: 10, total: 4 } });

    await listWorkflows({ page: 1, limit: 10, program: '  Informatics ', includeArchived: true });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).toContain('/workflows?');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
    expect(url).toContain('program=Informatics');
    expect(url).toContain('includeArchived=true');
  });

  it('omits program and includeArchived when unused (active-only default)', async () => {
    get.mockResolvedValue({ workflows: [], pagination: { page: 2, limit: 10, total: 0 } });

    await listWorkflows({ page: 2, limit: 10, program: '   ' });

    const url = String(get.mock.calls[0]?.[0]);
    expect(url).not.toContain('program=');
    expect(url).not.toContain('includeArchived=');
  });

  it('maps summaries: isDefault flag, Date updatedAt, null program', async () => {
    get.mockResolvedValue({
      workflows: [{ ...SUMMARY, program: null, archivedAt: new Date('2026-04-01T00:00:00.000Z') }],
      pagination: { page: 1, limit: 10, total: 1 },
    });

    const page = await listWorkflows({ page: 1, limit: 10 });

    expect(page.items[0]).toMatchObject({
      isDefault: true,
      program: null,
      archivedAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-03-01T09:00:00.000Z',
    });
  });

  it('throws on structure drift — a write-path screen never shows fixtures', async () => {
    get.mockResolvedValue({ unexpected: true });

    await expect(listWorkflows({ page: 1, limit: 10 })).rejects.toThrow(/array missing/);
  });
});

describe('getWorkflow (detail, §11.14)', () => {
  it('maps {workflow, stages} with gate defaults and unknown-role defence', async () => {
    get.mockResolvedValue(
      detail({
        ...SUMMARY,
        archivedAt: '2026-05-01T00:00:00.000Z',
      }),
    );

    const state = await getWorkflow('wf-1');

    expect(get).toHaveBeenCalledWith('/workflows/wf-1');
    expect(state.workflow.isDefault).toBe(true);
    expect(state.stages[0]).toMatchObject({
      position: 1,
      responsibleRole: 'supervisor',
      requiresSubmission: true,
      requiresReview: true,
      requiresApproval: true,
    });
  });

  it('defaults absent gates to false, bad roles to null and bad offsets to null', async () => {
    get.mockResolvedValue({
      workflow: SUMMARY,
      stages: [
        {
          id: 'st-2',
          position: 2,
          name: 'Draft chapter',
          dueOffsetDays: 'soon',
          responsibleRole: 'dean',
          // gates omitted entirely
        },
      ],
    });

    const state = await getWorkflow('wf-1');

    expect(state.stages[0]).toMatchObject({
      dueOffsetDays: null,
      responsibleRole: null,
      requiresSubmission: false,
      requiresReview: false,
      requiresApproval: false,
    });
  });

  it('throws when the workflow envelope is missing (shape changed)', async () => {
    get.mockResolvedValue({ stages: [] });

    await expect(getWorkflow('wf-1')).rejects.toThrow(/`workflow` missing/);
  });

  it('throws when stages is not an array', async () => {
    get.mockResolvedValue({ workflow: SUMMARY, stages: 'nope' });

    await expect(getWorkflow('wf-1')).rejects.toThrow(/array missing/);
  });
});

describe('workflow writes (FR-CW-01…03 + PROPOSED isDefault delta)', () => {
  it('create POSTs the input verbatim — creation never injects isDefault', async () => {
    post.mockResolvedValue(detail({ ...SUMMARY, isDefault: false, name: 'New' }));

    const input = {
      name: 'New',
      program: null,
      academicSession: null,
      description: null,
      stages: [{ name: 'Stage one', requiresSubmission: false }],
    };
    const state = await createWorkflow(input);

    expect(post).toHaveBeenCalledWith('/workflows', input);
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty('isDefault');
    expect(state.workflow.name).toBe('New');
  });

  it('patch forwards metadata + whole-set stages + isDefault in one write', async () => {
    patch.mockResolvedValue(detail());

    const input = { name: 'Renamed', stages: [{ name: 'A' }, { name: 'B' }], isDefault: true };
    await patchWorkflow('wf-1', input);

    expect(patch).toHaveBeenCalledWith('/workflows/wf-1', input);
    expect(patch.mock.calls[0]?.[1]).toMatchObject({ isDefault: true });
  });

  it('delete issues DELETE on the definition path (422 surfaces as an error)', async () => {
    del.mockResolvedValue(undefined);

    await deleteWorkflow('wf-1');

    expect(del).toHaveBeenCalledWith('/workflows/wf-1');
  });

  it('propagates server rejections verbatim — no fake success (Rule 3)', async () => {
    patch.mockRejectedValue(new Error("422: can't make an archived workflow the default"));

    await expect(patchWorkflow('wf-1', { isDefault: true })).rejects.toThrow(/422/);
    expect(get).not.toHaveBeenCalled();
  });
});
