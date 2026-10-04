import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import StudentDetail, { useStudentContext } from './StudentDetail';
import { listCaseload } from '../data/supervisionRepo';
import type { CaseloadPage } from '../data/supervisionRepo';

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

const ENTRY = {
  assignmentId: 'asg-1',
  projectId: 'proj-1',
  assignedAt: '2026-09-15T09:00:00.000Z',
  isPrimary: true,
  student: {
    id: 's-1',
    firstName: 'Ola',
    lastName: 'Nordmann',
    email: 'ola@test.local',
  },
};

/** Probe: proves the shell hands every tab its caseload entry (plan 12.2). */
function ContextProbe() {
  const { entry } = useStudentContext();
  return (
    <p>
      probe:{entry.student.lastName}:{entry.projectId}
    </p>
  );
}

const renderDetail = (path = '/supervision/s-1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/supervision/:studentId" element={<StudentDetail />}>
            <Route path="overview" element={<ContextProbe />} />
            <Route path="milestones" element={<ContextProbe />} />
            <Route path="submissions" element={<ContextProbe />} />
            <Route path="feedback" element={<ContextProbe />} />
            <Route index element={<ContextProbe />} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

function signIn(caseload: CaseloadPage): void {
  vi.mocked(listCaseload).mockResolvedValue(caseload);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StudentDetail (§16.3 / plan 12.2)', () => {
  it('resolves the student, renders the four tabs and passes the entry to children', async () => {
    signIn({ students: [ENTRY], usedFallback: false });
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Ola Nordmann' })).toBeInTheDocument();
    expect(screen.getByText('Primary supervisor')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Overview', 'Milestones', 'Submissions', 'Feedback']);
    // index redirects to overview and the child received the context.
    expect(await screen.findByText('probe:Nordmann:proj-1')).toBeInTheDocument();
  });

  it('gives a student without a project (ADR-13) an explanation, not a dead end', async () => {
    signIn({ students: [{ ...ENTRY, projectId: null }], usedFallback: false });
    renderDetail('/supervision/s-1/overview');

    expect(await screen.findByText(/has no project yet/i)).toBeInTheDocument();
    expect(screen.getByText(/tracker starts when a proposal is approved/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByRole('link', { name: /go to proposals/i })).toBeInTheDocument();
  });

  it('refuses a student who is not on the caseload, with a way back', async () => {
    signIn({ students: [], usedFallback: false });
    renderDetail('/supervision/s-9');

    expect(await screen.findByText('Not on your caseload')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to students/i })).toBeInTheDocument();
  });
});
