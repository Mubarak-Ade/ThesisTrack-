import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SubmissionReview from './SubmissionReview';
import {
  downloadVersion,
  getSubmissionBundle,
  reviewSubmission,
} from '../data/supervisionRepo';
import type { SubmissionBundle } from '../data/supervisionRepo';
import type { Submission, SubmissionReview as Decision } from '../data/types';

vi.mock('../data/supervisionRepo', () => ({
  listCaseload: vi.fn(),
  getSupervisorDashboard: vi.fn(),
  getProject: vi.fn(),
  getStageTracker: vi.fn(),
  listMilestones: vi.fn(),
  listSubmissions: vi.fn(),
  getSubmissionBundle: vi.fn(),
  listProjectFeedback: vi.fn(),
  advanceStage: vi.fn(),
  createMilestone: vi.fn(),
  patchMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  reorderMilestones: vi.fn(),
  changeMilestoneStatus: vi.fn(),
  reviewSubmission: vi.fn(),
  postFeedback: vi.fn(),
  postSubmissionFeedback: vi.fn(),
  patchFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  downloadVersion: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { toast } = await import('sonner');

const SUBMITTER = {
  id: 's-1',
  firstName: 'Ola',
  lastName: 'Nordmann',
  email: 'ola@test.local',
};

const SUBMISSION: Submission = {
  id: 'sub-1',
  projectId: 'proj-1',
  milestoneId: 'ms-1',
  title: 'Chapter 2 draft',
  status: 'submitted',
  submittedAt: '2026-10-03T16:45:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-03T16:45:00.000Z',
  submitter: SUBMITTER,
};

const DECISION: Decision = {
  id: 'r-1',
  decision: 'revision_required',
  comment: 'Cite the append-only survey.',
  createdAt: '2026-10-04T00:00:00.000Z',
  reviewer: {
    id: 'sup-1',
    firstName: 'Helen',
    lastName: 'Brooks',
    email: 'h@t.local',
  },
};

function bundleOf(overrides: Partial<SubmissionBundle> = {}): SubmissionBundle {
  return {
    submission: SUBMISSION,
    versions: [
      {
        id: 'v-2',
        submissionId: 'sub-1',
        versionNumber: 2,
        body: 'A chapter about append-only logs.',
        originalFilename: null,
        mimeType: null,
        sizeBytes: null,
        createdAt: '2026-10-03T16:45:00.000Z',
      },
      {
        id: 'v-1',
        submissionId: 'sub-1',
        versionNumber: 1,
        body: null,
        originalFilename: 'chapter-2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    reviews: [DECISION],
    feedback: [],
    ...overrides,
  };
}

const renderReview = () =>
  render(
    <MemoryRouter initialEntries={['/supervision/s-1/submissions/sub-1']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route
            path="/supervision/:studentId/submissions/:submissionId"
            element={<SubmissionReview />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSubmissionBundle).mockResolvedValue(bundleOf());
  vi.mocked(downloadVersion).mockResolvedValue(undefined);
  vi.mocked(reviewSubmission).mockResolvedValue({
    review: { ...DECISION, decision: 'approved', comment: null },
    submission: { ...SUBMISSION, status: 'approved' },
  });
});

describe('SubmissionReview (§16.3 / plan 12.4)', () => {
  it('renders versions, download, the append-only history and the decision form', async () => {
    renderReview();

    expect(await screen.findByRole('heading', { name: 'Chapter 2 draft' })).toBeInTheDocument();
    // Both versions, newest first (I7).
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('chapter-2.pdf')).toBeInTheDocument();
    // §11.6 history names its reviewer (I8 — never editable).
    expect(screen.getByText('Helen Brooks')).toBeInTheDocument();
    expect(screen.getByText('Cite the append-only survey.')).toBeInTheDocument();
    expect(screen.getByText('Decision history (§11.6)')).toBeInTheDocument();
    // §11.7 discussion stays separate from decisions.
    expect(screen.getByText('Discussion')).toBeInTheDocument();
    expect(screen.getByText('Decision', { selector: 'legend' })).toBeInTheDocument();
  });

  it('downloads a file version through §14.5', async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole('button', { name: /download/i }));
    await waitFor(() => expect(downloadVersion).toHaveBeenCalled());
  });

  it('records a commenting decision without any dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewSubmission).mockResolvedValue({
      review: { ...DECISION },
      submission: { ...SUBMISSION, status: 'revision_required' },
    });
    renderReview();

    await user.click(await screen.findByRole('radio', { name: /revision required/i }));
    await user.type(screen.getByLabelText(/comment/i), 'Tighten the related-work section.');
    await user.click(screen.getByRole('button', { name: /request revision/i }));

    await waitFor(() =>
      expect(reviewSubmission).toHaveBeenCalledWith('sub-1', {
        decision: 'revision_required',
        comment: 'Tighten the related-work section.',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toast.success).toHaveBeenCalled();
  });

  it('offers no decision form once the status left the input set', async () => {
    vi.mocked(getSubmissionBundle).mockResolvedValue(
      bundleOf({
        submission: { ...SUBMISSION, status: 'approved' },
      }),
    );
    renderReview();

    expect(await screen.findByRole('heading', { name: 'Chapter 2 draft' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record approval/i })).toBeNull();
  });

  it('shows the honest not-found state on 404', async () => {
    vi.mocked(getSubmissionBundle).mockResolvedValue(null);
    renderReview();

    expect(await screen.findByText('No such submission')).toBeInTheDocument();
  });
});
