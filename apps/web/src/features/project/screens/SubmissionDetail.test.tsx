import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SubmissionDetail from './SubmissionDetail';
import type {
  FeedbackEntry,
  ProjectSummary,
  Submission,
  SubmissionVersion,
} from '../data/types';
import { useAuthStore } from '@/stores/auth';

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

const {
  listMyProjects,
  getSubmission,
  listVersions,
  listSubmissionReviews,
  listSubmissionFeedback,
  submitSubmission,
  deleteSubmission,
  appendVersion,
  postSubmissionFeedback,
  downloadVersion,
} = await import('../data/projectRepo');

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  title: 'Ledger',
  description: '',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const SUBMITTER = { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' };

const DRAFT: Submission = {
  id: 'sub-1',
  projectId: 'proj-1',
  milestoneId: null,
  title: 'Chapter 3',
  status: 'draft',
  submittedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  submitter: SUBMITTER,
};

const REVISION: Submission = {
  ...DRAFT,
  id: 'sub-2',
  status: 'revision_required',
  submittedAt: '2026-10-01T00:00:00.000Z',
};

const VERSIONS: SubmissionVersion[] = [
  {
    id: 'v-2',
    submissionId: 'sub-2',
    versionNumber: 2,
    body: 'Revised chapter text.',
    originalFilename: null,
    mimeType: null,
    sizeBytes: null,
    createdAt: '2026-10-02T00:00:00.000Z',
  },
  {
    id: 'v-1',
    submissionId: 'sub-2',
    versionNumber: 1,
    body: null,
    originalFilename: 'chapter.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
];

const FEEDBACK: FeedbackEntry[] = [
  {
    id: 'f-1',
    projectId: 'proj-1',
    submissionId: 'sub-2',
    body: 'Narrow the scope.',
    createdAt: '2026-10-02T09:00:00.000Z',
    updatedAt: '2026-10-02T09:00:00.000Z',
    author: { id: 'sup-1', firstName: 'Helen', lastName: 'Brooks', email: 'h@t.local' },
  },
];

const renderDetail = (id = 'sub-1') =>
  render(
    <MemoryRouter initialEntries={[`/project/submissions/${id}`]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/project/submissions/:submissionId" element={<SubmissionDetail />} />
          <Route path="/project/submissions" element={<div>submissions list destination</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
  vi.mocked(getSubmission).mockResolvedValue(DRAFT);
  vi.mocked(listVersions).mockResolvedValue([]);
  vi.mocked(listSubmissionReviews).mockResolvedValue([]);
  vi.mocked(listSubmissionFeedback).mockResolvedValue([]);
  vi.mocked(submitSubmission).mockResolvedValue({ ...DRAFT, status: 'submitted' });
  vi.mocked(deleteSubmission).mockResolvedValue(undefined);
  vi.mocked(appendVersion).mockResolvedValue(VERSIONS[0]);
  vi.mocked(postSubmissionFeedback).mockResolvedValue(FEEDBACK[0]);
  vi.mocked(downloadVersion).mockResolvedValue(undefined);
  useAuthStore.setState({
    user: {
      id: 's-1',
      email: 'o@t.local',
      firstName: 'Ola',
      lastName: 'Nordmann',
      role: 'student',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    status: 'authenticated',
    accessToken: 'token',
  });
});

describe('SubmissionDetail (§16.3, plan 11.3 — history/discussion split)', () => {
  it('offers submit and delete while the submission is a draft (§5.5)', async () => {
    const user = userEvent.setup();
    renderDetail('sub-1');

    expect(await screen.findByRole('heading', { name: 'Chapter 3' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/submitting hands it to your supervisor/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /submit now/i }));
    expect(submitSubmission).toHaveBeenCalledWith('sub-1');
  });

  it('routes draft deletion through the destructive confirmation and leaves', async () => {
    const user = userEvent.setup();
    renderDetail('sub-1');

    await user.click(await screen.findByRole('button', { name: /delete draft/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete this draft?');
    await user.click(within(dialog).getByRole('button', { name: 'Delete draft' }));

    expect(deleteSubmission).toHaveBeenCalledWith('sub-1');
    expect(await screen.findByText('submissions list destination')).toBeInTheDocument();
  });

  it('shows the immutable version history, newest first (I7)', async () => {
    vi.mocked(getSubmission).mockResolvedValue(REVISION);
    vi.mocked(listVersions).mockResolvedValue(VERSIONS);
    renderDetail('sub-2');

    expect(await screen.findByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Revised chapter text.')).toBeInTheDocument();
    expect(screen.getByText('chapter.pdf')).toBeInTheDocument();

    const [first] = screen.getAllByRole('button', { name: /download/i });
    expect(first).toBeInTheDocument();
  });

  it('downloads a file version through the authenticated byte route (§14.5)', async () => {
    vi.mocked(getSubmission).mockResolvedValue(REVISION);
    vi.mocked(listVersions).mockResolvedValue(VERSIONS);
    renderDetail('sub-2');
    const user = userEvent.setup();

    const button = await screen.findByRole('button', { name: /download/i }); // the v1 file row
    await user.click(button);
    expect(downloadVersion).toHaveBeenCalledWith(VERSIONS[1]);
  });

  it('renders the formal review decisions apart from discussion (§11.6 vs §11.7)', async () => {
    vi.mocked(getSubmission).mockResolvedValue(REVISION);
    vi.mocked(listSubmissionReviews).mockResolvedValue([
      { id: 'r-1', decision: 'revision_required', comment: 'Tighten §3.', createdAt: '2026-10-02T00:00:00.000Z' },
    ]);
    vi.mocked(listSubmissionFeedback).mockResolvedValue(FEEDBACK);
    renderDetail('sub-2');

    expect(await screen.findByText(/Supervisor decisions/)).toBeInTheDocument();
    expect(screen.getByText('revision required')).toBeInTheDocument();
    expect(screen.getByText('Tighten §3.')).toBeInTheDocument();
    // Discussion stays its own card with the §11.7 thread.
    expect(screen.getByText('Narrow the scope.')).toBeInTheDocument();
    expect(screen.getByLabelText(/ask a question or leave a note/i)).toBeInTheDocument();
  });

  it('offers the new-version composer only when a revision was requested', async () => {
    vi.mocked(getSubmission).mockResolvedValue(REVISION);
    vi.mocked(listVersions).mockResolvedValue(VERSIONS);
    renderDetail('sub-2');

    expect(await screen.findByText(/Versions are immutable \(I7\)/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Revised text'), 'Tightened chapter.');
    await user.click(screen.getByRole('button', { name: /post new version/i }));

    await waitFor(() => expect(appendVersion).toHaveBeenCalledTimes(1));
    expect(appendVersion).toHaveBeenCalledWith(
      'sub-2',
      { body: 'Tightened chapter.' },
      expect.any(Function),
    );
  });

  it('keeps the composer hidden for a plain draft (no revision requested)', async () => {
    renderDetail('sub-1');
    expect(await screen.findByRole('heading', { name: 'Chapter 3' })).toBeInTheDocument();
    expect(screen.queryByText(/Versions are immutable/)).toBeNull();
  });

  it('explains a missing submission instead of a blank screen', async () => {
    vi.mocked(getSubmission).mockResolvedValue(null);
    renderDetail('nope');

    expect(await screen.findByText('No such submission')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to submissions/i })).toHaveAttribute(
      'href',
      '/project/submissions',
    );
  });
});
