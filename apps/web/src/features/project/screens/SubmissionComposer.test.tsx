import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SubmissionComposer from './SubmissionComposer';
import type { Milestone, ProjectSummary, Submission } from '../data/types';

vi.mock('../data/projectRepo', () => ({
  listMyProjects: vi.fn(),
  getProject: vi.fn(),
  getStageTracker: vi.fn(),
  getSupervisor: vi.fn(),
  getOverviewBundle: vi.fn(),
  listMilestones: vi.fn(),
  listSubmissions: vi.fn(),
  getSubmission: vi.fn(),
  listVersions: vi.fn(),
  listProjectFeedback: vi.fn(),
  listSubmissionFeedback: vi.fn(),
  listSubmissionReviews: vi.fn(),
  getActivity: vi.fn(),
  createSubmission: vi.fn(),
  patchSubmission: vi.fn(),
  submitSubmission: vi.fn(),
  appendVersion: vi.fn(),
  deleteSubmission: vi.fn(),
  changeMilestoneStatus: vi.fn(),
  postFeedback: vi.fn(),
  postSubmissionFeedback: vi.fn(),
  patchFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  downloadVersion: vi.fn(),
}));

const { listMyProjects, listMilestones, createSubmission, submitSubmission } = await import(
  '../data/projectRepo'
);

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  title: 'Ledger',
  description: '',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const CREATED: Submission = {
  id: 'sub-9',
  projectId: 'proj-1',
  milestoneId: null,
  title: 'Chapter 3',
  status: 'draft',
  submittedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  submitter: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
};

const MILESTONE: Milestone = {
  id: 'm-1',
  projectId: 'proj-1',
  title: 'Design document',
  description: null,
  position: 0,
  dueAt: null,
  status: 'in_progress',
  state: 'in_progress',
  completedAt: null,
};

const renderComposer = () =>
  render(
    <MemoryRouter initialEntries={['/project/submissions/new']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/project/submissions/new" element={<SubmissionComposer />} />
          <Route
            path="/project/submissions/:submissionId"
            element={<div>submission detail destination</div>}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
  vi.mocked(listMilestones).mockResolvedValue([MILESTONE]);
  vi.mocked(createSubmission).mockResolvedValue(CREATED);
  vi.mocked(submitSubmission).mockResolvedValue({ ...CREATED, status: 'submitted' });
});

describe('SubmissionComposer (§11.5, task 11.4 — text OR file with progress)', () => {
  it('refuses to save without a title', async () => {
    const user = userEvent.setup();
    renderComposer();

    const save = await screen.findByRole('button', { name: /save draft/i });
    await user.click(save);

    expect(await screen.findByRole('alert')).toHaveTextContent('A title is required.');
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('saves a text draft and lands on the submission detail', async () => {
    const user = userEvent.setup();
    renderComposer();

    await screen.findByRole('button', { name: /save draft/i });
    await user.type(screen.getByLabelText('Title'), 'Chapter 3');
    await user.type(screen.getByLabelText('Body'), 'The data model.');
    // The milestone select is fed by §11.4's rows.
    expect(screen.getByRole('option', { name: 'Design document' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText('submission detail destination')).toBeInTheDocument();
    expect(createSubmission).toHaveBeenCalledWith(
      { projectId: 'proj-1', title: 'Chapter 3', body: 'The data model.' },
      undefined,
      expect.any(Function),
    );
    expect(submitSubmission).not.toHaveBeenCalled();
  });

  it('creates and submits in one move (§5.5 — version 1 before review)', async () => {
    const user = userEvent.setup();
    renderComposer();

    await screen.findByRole('button', { name: /save draft/i });
    await user.type(screen.getByLabelText('Title'), 'Chapter 3');
    await user.click(screen.getByRole('button', { name: /create & submit/i }));

    expect(await screen.findByText('submission detail destination')).toBeInTheDocument();
    expect(createSubmission).toHaveBeenCalled();
    expect(submitSubmission).toHaveBeenCalledWith('sub-9');
  });

  it('uploads a file instead of a body — exactly one form (§14.2)', async () => {
    const user = userEvent.setup();
    renderComposer();
    const file = new File(['%PDF-1.4'], 'chapter.pdf', { type: 'application/pdf' });

    await screen.findByRole('button', { name: /save draft/i });
    await user.type(screen.getByLabelText('Title'), 'Chapter 3');
    await user.click(screen.getByRole('button', { name: /upload file/i }));
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });
    expect(screen.getByText(/Selected:/)).toHaveTextContent('chapter.pdf');

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText('submission detail destination')).toBeInTheDocument();
    const [input, sentFile, onProgress] = vi.mocked(createSubmission).mock.calls[0];
    expect(input).toEqual({ projectId: 'proj-1', title: 'Chapter 3' }); // no body
    expect(sentFile).toBeInstanceOf(File);
    expect(typeof onProgress).toBe('function'); // real progress, not a fake bar
  });

  it('surfaces a failed write instead of navigating (Rule 3)', async () => {
    vi.mocked(createSubmission).mockRejectedValue(new Error('server said no'));
    const user = userEvent.setup();
    renderComposer();

    await screen.findByRole('button', { name: /save draft/i });
    await user.type(screen.getByLabelText('Title'), 'Chapter 3');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    // The write failed → no navigation, no fake success; the screen stays.
    await waitFor(() => expect(createSubmission).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('submission detail destination')).toBeNull();
    expect(screen.getByRole('heading', { name: 'New submission' })).toBeInTheDocument();
  });

  it('explains the legitimate no-project state', async () => {
    vi.mocked(listMyProjects).mockResolvedValue([]);
    renderComposer();

    expect(await screen.findByText('You don’t have an active project')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });
});
