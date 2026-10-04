import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import StageTracker from './StageTracker';
import MilestoneBar from './MilestoneBar';
import DeadlineChip from './DeadlineChip';
import type { ProjectStage, StageTracker as Tracker } from './StageTracker';

const BASE: ProjectStage = {
  id: 'st-1',
  position: 0,
  status: 'pending',
  name: 'Stage',
  description: null,
  deliverable: null,
  responsibleRole: null,
  requiresSubmission: false,
  requiresReview: false,
  requiresApproval: false,
  startedAt: null,
  completedAt: null,
  dueOffsetDays: null,
  dueAt: null,
  overdue: false,
};

const STAGES: ProjectStage[] = [
  { ...BASE, id: 'st-1', position: 0, status: 'completed', name: 'Proposal' },
  {
    ...BASE,
    id: 'st-2',
    position: 1,
    status: 'active',
    name: 'Design',
    deliverable: 'Design document',
    responsibleRole: 'student',
    dueOffsetDays: 21,
    dueAt: '2026-10-21T00:00:00.000Z',
  },
  { ...BASE, id: 'st-3', position: 2, name: 'Implementation' },
];

const tracker: Tracker = {
  stages: STAGES,
  current: { ...STAGES[1], unmet: [] },
};

describe('StageTracker (§16.5, plan 11.3 — ✓/●/○)', () => {
  it('renders completed, current and upcoming markers distinctly', () => {
    const { container } = render(<StageTracker tracker={tracker} />);

    expect(screen.getByText('Proposal')).toBeInTheDocument(); // ✓ completed
    expect(screen.getByText('Implementation')).toBeInTheDocument(); // ○ upcoming
    expect(screen.getByText('Current')).toBeInTheDocument(); // ● labelled
    expect(screen.getByRole('list')).toBeInTheDocument();

    // The current step is programmatically current, not just coloured.
    const current = screen.getByText('Design').closest('li');
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('shows the current stage deliverable, responsible role and deadline inline', () => {
    render(<StageTracker tracker={tracker} />);
    expect(screen.getByText(/Deliverable:/)).toHaveTextContent('Design document');
    expect(screen.getByText(/Responsible:/)).toHaveTextContent('Student');
    expect(screen.getByText(/Deadline:/)).toBeInTheDocument();
  });

  it('keeps an empty tracker legal (§3.4 zero stages)', () => {
    render(<StageTracker tracker={{ stages: [], current: null }} />);
    expect(screen.getByText(/No workflow stages for this project yet/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('MilestoneBar (§5.6 derived progress)', () => {
  it('shows approved/total and the derived percentage', () => {
    render(<MilestoneBar approved={2} total={3} percent={67} />);
    expect(screen.getByText('2 of 3 milestones approved')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
  });

  it('explains the zero-milestone state instead of showing a fake bar', () => {
    render(<MilestoneBar approved={0} total={0} percent={0} />);
    expect(screen.getByText(/No milestones yet/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('DeadlineChip (§16.5 computed, never stored)', () => {
  const DAY = 86_400_000;

  it('renders a relative deadline', () => {
    render(<DeadlineChip dueAt={new Date(Date.now() + 3 * DAY + 7_200_000).toISOString()} />);
    expect(screen.getByText('due in 3 days')).toBeInTheDocument();
  });

  it('renders an overdue deadline in the danger tone', () => {
    render(<DeadlineChip dueAt={new Date(Date.now() - 2 * DAY).toISOString()} />);
    const chip = screen.getByText('overdue by 2 days');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-danger-bg');
  });

  it('renders nothing when the deadline is unknown', () => {
    const { container } = render(<DeadlineChip dueAt={null} />);
    expect(container.textContent).toBe('');
  });
});
