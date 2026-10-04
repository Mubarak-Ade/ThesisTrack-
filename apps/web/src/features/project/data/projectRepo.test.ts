import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PROJECT_FIXTURE } from './mock/fixtures';

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
const { uploadFile, downloadFile } = await import('@/lib/api/files');
const repo = await import('./projectRepo');

const PROJECT_ROW = {
  id: 'proj-1',
  title: 'Distributed ledger',
  description: 'Append-only records.',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
};

const SUBMISSION_ROW = {
  id: 'sub-1',
  projectId: 'proj-1',
  title: 'Chapter 3',
  status: 'draft',
  submittedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  submitter: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reads (§10.4 live-first)', () => {
  it('listMyProjects maps the scoped list', async () => {
    vi.mocked(api.get).mockResolvedValue({ projects: [PROJECT_ROW] });
    const projects = await repo.listMyProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ id: 'proj-1', title: 'Distributed ledger' });
    expect(api.get).toHaveBeenCalledWith('/projects?page=1&limit=50');
  });

  it('listMyProjects throws on envelope drift (strict)', async () => {
    vi.mocked(api.get).mockResolvedValue({ projects: 'not-an-array' });
    await expect(repo.listMyProjects()).rejects.toThrow('projects envelope missing');
  });

  it('getSubmission maps 404 to null but rethrows authorization failures', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'gone' }),
    );
    expect(await repo.getSubmission('nope')).toBeNull();

    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError({ status: 403, code: 'AUTHORIZATION_ERROR', message: 'no' }),
    );
    await expect(repo.getSubmission('x')).rejects.toMatchObject({ status: 403 });
  });

  it('getSupervisor returns null for an unassigned project and never throws', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ active: null, history: [] });
    expect(await repo.getSupervisor('proj-1')).toBeNull();

    vi.mocked(api.get).mockRejectedValueOnce(new Error('network'));
    expect(await repo.getSupervisor('proj-1')).toBeNull();
  });

  it('getOverviewBundle combines the four reads live', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/projects/proj-1') return { project: PROJECT_ROW };
      if (url.endsWith('/stages')) return { stages: [], current: null };
      if (url.endsWith('/milestones')) return { milestones: [] };
      if (url.endsWith('/supervisor')) return { active: null, history: [] };
      throw new Error(`unexpected ${url}`);
    });

    const bundle = await repo.getOverviewBundle('proj-1');
    expect(bundle.usedFallback).toBe(false);
    expect(bundle.project.id).toBe('proj-1');
    expect(bundle.supervisor).toBeNull();
  });

  it('getOverviewBundle falls back to the fixture only when asked (§10.4)', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));

    await expect(repo.getOverviewBundle('proj-1')).rejects.toThrow('offline');

    const fallback = await repo.getOverviewBundle('proj-1', { allowFallback: true });
    expect(fallback).toBe(PROJECT_FIXTURE);
    expect(fallback.usedFallback).toBe(true);
  });

  it('listSubmissions passes the filters as query params', async () => {
    vi.mocked(api.get).mockResolvedValue({ submissions: [SUBMISSION_ROW] });
    await repo.listSubmissions('proj-1', { status: 'draft', milestoneId: 'm-1' });
    expect(api.get).toHaveBeenCalledWith(
      '/projects/proj-1/submissions?milestoneId=m-1&status=draft',
    );
  });
});

describe('writes (never fake success)', () => {
  it('createSubmission posts JSON when there is a body', async () => {
    vi.mocked(api.post).mockResolvedValue({ submission: SUBMISSION_ROW });
    const created = await repo.createSubmission({
      projectId: 'proj-1',
      title: 'Chapter 3',
      body: 'text',
    });
    expect(created.id).toBe('sub-1');
    expect(api.post).toHaveBeenCalledWith('/submissions', {
      projectId: 'proj-1',
      title: 'Chapter 3',
      body: 'text',
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('createSubmission rides multipart with the `file` field when a file is given', async () => {
    vi.mocked(uploadFile).mockResolvedValue({ submission: SUBMISSION_ROW });
    const progress = vi.fn();
    await repo.createSubmission(
      { projectId: 'proj-1', title: 'Ch' },
      new File(['x'], 'ch.pdf'),
      progress,
    );

    expect(api.post).not.toHaveBeenCalled();
    const [url, form, onProgress] = vi.mocked(uploadFile).mock.calls[0];
    expect(url).toBe('/submissions');
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('file')).toBeInstanceOf(File);
    expect(onProgress).toBe(progress); // §11.4 real progress, not a fake bar
  });

  it('submitSubmission hits the §5.5 transition endpoint', async () => {
    vi.mocked(api.post).mockResolvedValue({ submission: { ...SUBMISSION_ROW, status: 'submitted' } });
    const row = await repo.submitSubmission('sub-1');
    expect(api.post).toHaveBeenCalledWith('/submissions/sub-1/submit');
    expect(row.status).toBe('submitted');
  });

  it('appendVersion posts text or multipart, never both', async () => {
    vi.mocked(api.post).mockResolvedValue({ version: { id: 'v-2', versionNumber: 2, body: 'b' } });
    await repo.appendVersion('sub-1', { body: 'b' });
    expect(api.post).toHaveBeenCalledWith('/submissions/sub-1/versions', { body: 'b' });

    vi.mocked(uploadFile).mockResolvedValue({ version: { id: 'v-3', versionNumber: 3 } });
    await repo.appendVersion('sub-1', { file: new File(['x'], 'v.pdf') });
    expect(uploadFile).toHaveBeenCalledWith(
      '/submissions/sub-1/versions',
      expect.any(FormData),
      undefined,
    );
  });

  it('changeMilestoneStatus posts the §11.4 target', async () => {
    vi.mocked(api.post).mockResolvedValue({
      milestone: { id: 'm-1', title: 'Review', status: 'in_progress' },
    });
    await repo.changeMilestoneStatus('m-1', 'in_progress');
    expect(api.post).toHaveBeenCalledWith('/milestones/m-1/status', { status: 'in_progress' });
  });

  it('surfaces write failures instead of pretending success (Rule 3)', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError({ status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'nope' }),
    );
    await expect(repo.submitSubmission('sub-1')).rejects.toMatchObject({ status: 422 });
    await expect(repo.postFeedback('proj-1', 'hi')).rejects.toMatchObject({ status: 422 });
    await expect(
      repo.changeMilestoneStatus('m-1', 'approved'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('maps feedback writes and throws on a malformed envelope', async () => {
    vi.mocked(api.post).mockResolvedValue({
      feedback: {
        id: 'f-1',
        body: 'hello',
        updatedAt: '2026-10-01T00:00:00.000Z',
        author: { id: 'u-1', firstName: 'A', lastName: 'B', email: 'a@t.local' },
      },
    });
    const entry = await repo.postFeedback('proj-1', 'hello');
    expect(entry.id).toBe('f-1');

    vi.mocked(api.post).mockResolvedValue({ feedback: {} });
    await expect(repo.postFeedback('proj-1', 'x')).rejects.toThrow('Malformed feedback');
  });

  it('deleteFeedback issues the DELETE', async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined);
    await repo.deleteFeedback('f-1');
    expect(api.delete).toHaveBeenCalledWith('/feedback/f-1');
  });

  it('downloadVersion downloads to the version filename (§14.5)', async () => {
    vi.mocked(downloadFile).mockResolvedValue(undefined);
    await repo.downloadVersion({
      id: 'v-1',
      submissionId: 'sub-1',
      versionNumber: 1,
      body: null,
      originalFilename: 'chapter.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(downloadFile).toHaveBeenCalledWith(
      '/submission-versions/v-1/download',
      'chapter.pdf',
    );
  });
});
