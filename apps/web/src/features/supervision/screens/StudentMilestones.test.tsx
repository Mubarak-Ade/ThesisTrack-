import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import StudentDetail from './StudentDetail';
import StudentMilestones from './StudentMilestones';
import {
  changeMilestoneStatus,
  createMilestone,
  deleteMilestone,
  listCaseload,
  listMilestones,
  reorderMilestones,
} from '../data/supervisionRepo';
import type { Milestone } from '../data/types';

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
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
};

function ms(overrides: Partial<Milestone>): Milestone {
  return {
    id: 'ms-1',
    projectId: 'proj-1',
    title: 'Proposal approved',
    description: null,
    position: 1,
    dueAt: null,
    status: 'pending',
    state: 'pending',
    completedAt: null,
    ...overrides,
  };
}

function stubRows(rows: Milestone[]): void {
  vi.mocked(listCaseload).mockResolvedValue({ students: [ENTRY], usedFallback: false });
  vi.mocked(listMilestones).mockResolvedValue(rows);
}

const renderMilestones = () =>
  render(
    <MemoryRouter initialEntries={['/supervision/s-1/milestones']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/supervision/:studentId" element={<StudentDetail />}>
            <Route path="milestones" element={<StudentMilestones />} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createMilestone).mockResolvedValue(ms({ id: 'ms-new', title: 'New' }));
  vi.mocked(changeMilestoneStatus).mockResolvedValue(ms({ status: 'approved', state: 'approved' }));
  vi.mocked(deleteMilestone).mockResolvedValue(ms({}));
  vi.mocked(reorderMilestones).mockResolvedValue([]);
});

describe('StudentMilestones (§11.4 / plan 12.5)', () => {
  it('lists rows in order with state chips and supervisor controls', async () => {
    stubRows([
      ms({ id: 'ms-a', title: 'First', position: 1 }),
      ms({ id: 'ms-b', title: 'Second', position: 2, status: 'submitted', state: 'submitted' }),
    ]);
    renderMilestones();

    expect(await screen.findByText('First')).toBeInTheDocument();
    const titles = screen.getAllByRole('listitem').map((row) => row.textContent ?? '');
    expect(titles[0]).toContain('First');
    expect(titles[1]).toContain('Second');
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add milestone' })).toBeInTheDocument();
  });

  it('validates the create form, then posts the trimmed row', async () => {
    const user = userEvent.setup();
    stubRows([]);
    renderMilestones();

    await user.click(await screen.findByRole('button', { name: 'Add milestone' }));
    await user.click(screen.getByRole('button', { name: 'Create milestone' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/title is required/i);
    expect(createMilestone).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^title/i), '  Proposal approved  ');
    await user.type(screen.getByLabelText(/deadline/i), '2099-01-01');
    await user.click(screen.getByRole('button', { name: 'Create milestone' }));

    await waitFor(() =>
      expect(createMilestone).toHaveBeenCalledWith('proj-1', {
        title: 'Proposal approved',
        description: null,
        dueAt: '2099-01-01T00:00:00.000Z',
      }),
    );
  });

  it('approves a submitted milestone through §11.4 any-status path', async () => {
    const user = userEvent.setup();
    stubRows([ms({ status: 'submitted', state: 'submitted' })]);
    renderMilestones();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(changeMilestoneStatus).toHaveBeenCalledWith('ms-1', 'approved'));
  });

  it('reorders upward through PUT /reorder with the swapped ids', async () => {
    const user = userEvent.setup();
    stubRows([ms({ id: 'ms-a', position: 1 }), ms({ id: 'ms-b', title: 'Second', position: 2 })]);
    renderMilestones();

    await user.click(await screen.findByRole('button', { name: 'Move Second up' }));
    await waitFor(() => expect(reorderMilestones).toHaveBeenCalledWith('proj-1', ['ms-b', 'ms-a']));
  });

  it('deletes only through the confirm dialog (destructive convention)', async () => {
    const user = userEvent.setup();
    stubRows([ms({})]);
    renderMilestones();

    await user.click(await screen.findByRole('button', { name: /delete proposal approved/i }));
    const dialog = await screen.findByRole('dialog');
    expect(deleteMilestone).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete milestone' }));
    await waitFor(() => expect(deleteMilestone).toHaveBeenCalledWith('ms-1'));
  });
});
