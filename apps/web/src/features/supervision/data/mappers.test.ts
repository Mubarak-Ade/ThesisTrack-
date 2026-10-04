import { describe, expect, it } from 'vitest';

import {
  buildDeadline,
  mapAwaitingProposal,
  mapCaseloadStudent,
  mapReview,
  mapStageTracker,
} from './mappers';
import type { Milestone } from './types';

describe('mapCaseloadStudent (§6.2 I13 / ADR-13)', () => {
  const ROW = {
    id: 'asg-1',
    projectId: 'proj-1',
    assignedAt: '2026-09-15T09:00:00.000Z',
    isPrimary: true,
    student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
  };

  it('maps one row per assignment with its join keys', () => {
    expect(mapCaseloadStudent(ROW)).toEqual({
      assignmentId: 'asg-1',
      projectId: 'proj-1',
      assignedAt: '2026-09-15T09:00:00.000Z',
      isPrimary: true,
      student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
    });
  });

  it('keeps a null projectId (assignment predating the project)', () => {
    const mapped = mapCaseloadStudent({ ...ROW, projectId: null });
    expect(mapped?.projectId).toBeNull();
  });

  it('rejects a row without a student', () => {
    expect(mapCaseloadStudent({ ...ROW, student: null })).toBeNull();
  });
});

describe('mapStageTracker (§11.14 / §16.5)', () => {
  it('carries current.unmet through (the disabled advance lists these)', () => {
    const tracker = mapStageTracker({
      stages: [
        {
          id: 'st-1',
          position: 1,
          status: 'active',
          name: 'Build',
          requiresSubmission: true,
          unmet: ['requires_submission', 'requires_review'],
        },
      ],
      current: {
        id: 'st-1',
        position: 1,
        status: 'active',
        name: 'Build',
        requiresSubmission: true,
        unmet: ['requires_submission', 'requires_review'],
      },
    });
    expect(tracker.current?.unmet).toEqual(['requires_submission', 'requires_review']);
  });

  it('accepts zero stages as a legal 200 (§3.4)', () => {
    expect(mapStageTracker({ stages: [], current: null })).toEqual({
      stages: [],
      current: null,
    });
  });

  it('throws on a shape-drifted envelope (so the repo can fall back)', () => {
    expect(() => mapStageTracker({})).toThrow('stages envelope missing');
  });
});

describe('mapAwaitingProposal (dashboard queue)', () => {
  const ROW = {
    id: 'p-1',
    title: 'Ledger',
    version: 2,
    status: 'submitted',
    submittedAt: '2026-10-02T10:00:00.000Z',
    student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@t.local' },
  };

  it('keeps submitted and under_review rows', () => {
    expect(mapAwaitingProposal(ROW)?.status).toBe('submitted');
    expect(mapAwaitingProposal({ ...ROW, status: 'under_review' })?.status).toBe('under_review');
  });

  it('drops every other status (approved/draft never await review)', () => {
    expect(mapAwaitingProposal({ ...ROW, status: 'approved' })).toBeNull();
    expect(mapAwaitingProposal({ ...ROW, status: 'draft' })).toBeNull();
  });
});

describe('mapReview (§11.6)', () => {
  it('names the reviewer and rejects an unknown decision', () => {
    const row = {
      id: 'r-1',
      decision: 'approved',
      comment: null,
      createdAt: '2026-10-04T00:00:00.000Z',
      reviewer: { id: 'sup-1', firstName: 'Helen', lastName: 'Brooks', email: 'h@t.local' },
    };
    expect(mapReview(row)?.reviewer.lastName).toBe('Brooks');
    expect(mapReview({ ...row, decision: 'maybe' })).toBeNull();
  });
});

describe('buildDeadline (§5.6 computed at read)', () => {
  const MILESTONE: Milestone = {
    id: 'ms-1',
    projectId: 'proj-1',
    title: 'Proposal approved',
    description: null,
    position: 1,
    dueAt: '2026-10-10T00:00:00.000Z',
    status: 'pending',
    state: 'pending',
    completedAt: null,
  };

  it('marks overdue against now, never stored', () => {
    const now = Date.parse('2026-10-20T00:00:00.000Z');
    expect(buildDeadline(MILESTONE, 's-1', 'Ola N', now)?.overdue).toBe(true);
    expect(buildDeadline({ ...MILESTONE, dueAt: null }, 's-1', 'Ola N', now)).toBeNull();
  });
});
