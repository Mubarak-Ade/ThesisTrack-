import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changeMilestoneStatus,
  createMilestone,
  getSubmissionBundle,
  getSupervisorDashboard,
  listCaseload,
  reviewSubmission,
} from './supervisionRepo';

vi.mock('@/lib/api/http', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    details?: unknown;
    constructor(init: { status: number; code: string; message: string; details?: unknown }) {
      super(init.message);
      this.status = init.status;
      this.code = init.code;
      this.details = init.details;
    }
  }
  return {
    ApiError,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

vi.mock('@/lib/api/files', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
}));

const { api, ApiError } = await import('@/lib/api/http');

const STUDENT_ROW = {
  id: 'asg-1',
  projectId: 'proj-1',
  assignedAt: '2026-09-15T09:00:00.000Z',
  isPrimary: true,
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('listCaseload (§6.2 I13)', () => {
  it('maps the students envelope, live', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ students: [STUDENT_ROW] });
    const page = await listCaseload();
    expect(page.usedFallback).toBe(false);
    expect(page.students).toHaveLength(1);
    expect(page.students[0].student.lastName).toBe('Nordmann');
    expect(api.get).toHaveBeenCalledWith('/supervisors/me/students');
  });

  it('falls back to fixtures with usedFallback on failure (never fakes a live read)', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));
    const page = await listCaseload();
    expect(page.usedFallback).toBe(true);
    expect(page.students.length).toBeGreaterThan(0);
  });

  it('falls back when the envelope drifts (shape strictness)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ wrong: [] });
    const page = await listCaseload();
    expect(page.usedFallback).toBe(true);
  });
});

describe('getSupervisorDashboard (§16.3 / plan 12.1)', () => {
  function routeGet(): void {
    vi.mocked(api.get).mockImplementation(((path: string) => {
      if (path === '/supervisors/me/students') {
        return Promise.resolve({ students: [STUDENT_ROW] });
      }
      if (path.startsWith('/projects?page=')) {
        return Promise.resolve({
          projects: [
            {
              id: 'proj-1',
              title: 'Campus ledger',
              description: 'Append-only records.',
              status: 'active',
              createdAt: '2026-09-12T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (path.startsWith('/proposals?page=')) {
        return Promise.resolve({
          proposals: [
            {
              id: 'p-9',
              title: 'Awaiting me',
              version: 1,
              status: 'submitted',
              submittedAt: '2026-10-02T10:00:00.000Z',
              student: STUDENT_ROW.student,
            },
            {
              id: 'p-10',
              title: 'Already approved',
              version: 1,
              status: 'approved',
              student: STUDENT_ROW.student,
            },
          ],
        });
      }
      if (path === '/projects/proj-1/stages') {
        return Promise.resolve({
          stages: [{ id: 'st-1', position: 1, status: 'active', name: 'Build' }],
          current: { id: 'st-1', position: 1, status: 'active', name: 'Build', unmet: [] },
        });
      }
      if (path === '/projects/proj-1/milestones') {
        return Promise.resolve({
          milestones: [
            {
              id: 'ms-1',
              projectId: 'proj-1',
              title: 'Chapter 2',
              position: 1,
              dueAt: '2099-01-01T00:00:00.000Z',
              status: 'pending',
            },
          ],
        });
      }
      if (path === '/projects/proj-1/submissions') {
        return Promise.resolve({
          submissions: [
            {
              id: 'sub-1',
              projectId: 'proj-1',
              title: 'Chapter 2 draft',
              status: 'submitted',
              submittedAt: '2026-10-03T16:45:00.000Z',
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-03T16:45:00.000Z',
              submitter: STUDENT_ROW.student,
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    }) as never);
  }

  it('joins caseload, projects, queue and deadlines into one view', async () => {
    routeGet();
    const dash = await getSupervisorDashboard();
    expect(dash.usedFallback).toBe(false);
    expect(dash.students[0]).toMatchObject({
      projectTitle: 'Campus ledger',
      stageName: 'Build',
    });
    expect(dash.awaitingProposals.map((row) => row.id)).toEqual(['p-9']); // approved filtered
    expect(dash.awaitingSubmissions[0]).toMatchObject({ id: 'sub-1', studentId: 's-1' });
    expect(dash.deadlines[0]).toMatchObject({ title: 'Chapter 2', overdue: false });
  });

  it('falls back to the fixture when any leg fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));
    const dash = await getSupervisorDashboard();
    expect(dash.usedFallback).toBe(true);
    expect(dash.students.length).toBeGreaterThan(0);
  });
});

describe('writes surface errors (never fake success)', () => {
  it('createMilestone POSTs and maps the row', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      milestone: {
        id: 'ms-1',
        projectId: 'proj-1',
        title: 'Proposal approved',
        position: 1,
        dueAt: null,
        status: 'pending',
      },
    });
    const milestone = await createMilestone('proj-1', { title: 'Proposal approved' });
    expect(api.post).toHaveBeenCalledWith('/projects/proj-1/milestones', {
      title: 'Proposal approved',
    });
    expect(milestone.title).toBe('Proposal approved');
  });

  it('createMilestone rejects a malformed envelope', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({});
    await expect(createMilestone('proj-1', { title: 'x' })).rejects.toThrow(
      'Malformed create-milestone response',
    );
  });

  it('changeMilestoneStatus posts the target status (§11.4 supervisor: any)', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      milestone: {
        id: 'ms-1',
        projectId: 'proj-1',
        title: 'Chapter 2',
        position: 1,
        dueAt: null,
        status: 'approved',
        completedAt: '2026-10-04T00:00:00.000Z',
      },
    });
    const milestone = await changeMilestoneStatus('ms-1', 'approved');
    expect(api.post).toHaveBeenCalledWith('/milestones/ms-1/status', { status: 'approved' });
    expect(milestone.status).toBe('approved');
  });

  it('reviewSubmission sends {decision, comment} and maps both rows', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      review: {
        id: 'r-1',
        decision: 'approved',
        comment: null,
        createdAt: '2026-10-04T00:00:00.000Z',
        reviewer: STUDENT_ROW.student,
      },
      submission: {
        id: 'sub-1',
        projectId: 'proj-1',
        title: 'Chapter 2 draft',
        status: 'approved',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-04T00:00:00.000Z',
        submitter: STUDENT_ROW.student,
      },
    });
    const out = await reviewSubmission('sub-1', { decision: 'approved' });
    expect(api.post).toHaveBeenCalledWith('/submissions/sub-1/reviews', { decision: 'approved' });
    expect(out.submission.status).toBe('approved');
    expect(out.review.decision).toBe('approved');
  });

  it('reviewSubmission rejects a malformed envelope', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({});
    await expect(reviewSubmission('sub-1', { decision: 'rejected' })).rejects.toThrow(
      'Malformed review-submission response',
    );
  });
});

describe('getSubmissionBundle (§11.5–§11.7)', () => {
  it('returns null on a genuine 404, never on transport errors', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Submission not found' }),
    );
    expect(await getSubmissionBundle('nope')).toBeNull();
  });

  it('propagates transport failures (honest error, no fake not-found)', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));
    await expect(getSubmissionBundle('sub-1')).rejects.toThrow('Network error');
  });
});
