import { describe, expect, it } from 'vitest';

import { resolveStudentState, type ProposalRef, type StudentStateInput } from './studentState';

function proposal(status: ProposalRef['status'], overrides: Partial<ProposalRef> = {}): ProposalRef {
  return {
    id: overrides.id ?? `p-${status}`,
    title: overrides.title ?? 'Distributed ledger for campus records',
    status,
    updatedAt: overrides.updatedAt ?? '2026-10-01T00:00:00.000Z',
  };
}

const SUPERVISOR = { firstName: 'Helen', lastName: 'Brooks', email: 'h.brooks@test.local' };

function input(overrides: Partial<StudentStateInput>): StudentStateInput {
  return {
    hasActiveSupervisor: true,
    supervisor: SUPERVISOR,
    proposals: [],
    projects: [],
    ...overrides,
  };
}

describe('resolveStudentState — §16.2 table, row by row', () => {
  it('State 0 — no active supervisor: Welcome, no actions', () => {
    const result = resolveStudentState(input({ hasActiveSupervisor: false, supervisor: null }));
    expect(result.state).toBe(0);
    expect(result.proposal).toBeNull();
    expect(result.supervisor).toBeNull();
  });

  it('State 1 — assigned, no proposal at all', () => {
    const result = resolveStudentState(input({}));
    expect(result.state).toBe(1);
    expect(result.hasDraft).toBe(false);
  });

  it('State 1 slot — a draft shares the row but flags the "continue" copy', () => {
    const result = resolveStudentState(input({ proposals: [proposal('draft')] }));
    expect(result.state).toBe(1);
    expect(result.hasDraft).toBe(true);
    expect(result.proposal?.status).toBe('draft');
  });

  it('State 2 — submitted', () => {
    const result = resolveStudentState(input({ proposals: [proposal('submitted')] }));
    expect(result.state).toBe(2);
    expect(result.proposal?.status).toBe('submitted');
  });

  it('State 2 — under_review', () => {
    const result = resolveStudentState(input({ proposals: [proposal('under_review')] }));
    expect(result.state).toBe(2);
  });

  it('State 3 — revision_required', () => {
    const result = resolveStudentState(input({ proposals: [proposal('revision_required')] }));
    expect(result.state).toBe(3);
  });

  it('State 4 — rejected with no newer in-flight proposal', () => {
    const result = resolveStudentState(
      input({ proposals: [proposal('rejected', { updatedAt: '2026-09-01T00:00:00.000Z' })] }),
    );
    expect(result.state).toBe(4);
  });

  it('State 5 — approved and the materialised project', () => {
    const result = resolveStudentState(
      input({
        proposals: [proposal('approved')],
        projects: [{ id: 'pr-1', title: 'Ledger', status: 'active' }],
      }),
    );
    expect(result.state).toBe(5);
    expect(result.project?.id).toBe('pr-1');
    expect(result.supervisor).toEqual(SUPERVISOR);
  });

  it('State 5 even when the project row has not materialised yet', () => {
    const result = resolveStudentState(input({ proposals: [proposal('approved')] }));
    expect(result.state).toBe(5);
    expect(result.project).toBeNull();
  });
});

describe('resolveStudentState — precedence across mixed histories', () => {
  it('an in-flight revision outranks an older rejection', () => {
    const result = resolveStudentState(
      input({ proposals: [proposal('rejected'), proposal('revision_required')] }),
    );
    expect(result.state).toBe(3);
  });

  it('a new draft outranks an older rejection (the student is acting)', () => {
    const result = resolveStudentState(
      input({ proposals: [proposal('rejected'), proposal('draft')] }),
    );
    expect(result.state).toBe(1);
    expect(result.hasDraft).toBe(true);
  });

  it('revision_required outranks a submitted row (student must act first)', () => {
    const result = resolveStudentState(
      input({ proposals: [proposal('submitted'), proposal('revision_required')] }),
    );
    expect(result.state).toBe(3);
  });

  it('an approval is not hidden by a later terminal rejection', () => {
    const result = resolveStudentState(
      input({
        proposals: [proposal('rejected', { updatedAt: '2026-10-02T00:00:00.000Z' }), proposal('approved')],
        projects: [{ id: 'pr-1', title: 'Ledger', status: 'active' }],
      }),
    );
    expect(result.state).toBe(5);
  });

  it('State 0 wins over everything — unassigned students are always State 0', () => {
    const result = resolveStudentState(
      input({ hasActiveSupervisor: false, supervisor: null, proposals: [proposal('draft')] }),
    );
    expect(result.state).toBe(0);
  });

  it('equal-rank in-flight rows fall back to the most recently updated', () => {
    const result = resolveStudentState(
      input({
        proposals: [
          proposal('submitted', { id: 'old', updatedAt: '2026-09-01T00:00:00.000Z' }),
          proposal('submitted', { id: 'new', updatedAt: '2026-10-01T00:00:00.000Z' }),
        ],
      }),
    );
    expect(result.proposal?.id).toBe('new');
  });
});
