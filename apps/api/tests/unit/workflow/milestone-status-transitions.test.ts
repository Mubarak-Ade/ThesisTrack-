import { describe, expect, it } from 'vitest';

import {
  isOverdue,
  isStatusTransitionAllowed,
  toMilestoneView,
} from '../../../src/modules/milestones/service.js';
import type { MilestoneStatus } from '../../../src/modules/milestones/types.js';
import type { Role } from '../../../src/lib/roles.js';

/**
 * Phase 4 unit test — the §11.4 milestone status matrix (spec §11.4, §5.6).
 *
 * Two behaviors are pinned here, both pure:
 *
 *   1. `isStatusTransitionAllowed` — the per-role TARGET matrix guards decide
 *      WHO may call; this decides WHAT a student may pick. Every one of the
 *      48 cells (3 roles × 4 stored states × 4 targets) is spelled out below,
 *      copied from the spec's table rather than derived from the code.
 *   2. `isOverdue` / `toMilestoneView` — §5.6's computed `overdue` (never a
 *      stored column, never a status target) and the canonical `state`, where
 *      `overdue` overrides the stored status at read time.
 *
 * `overdue` is deliberately absent from the targets: the schema refuses it as
 * input, so it can never be a transition endpoint (`MilestoneStatus`).
 */

const STATUSES = ['pending', 'in_progress', 'submitted', 'approved'] as const;
const ROLES: Role[] = ['student', 'supervisor', 'administrator'];

/**
 * The §11.4 matrix, copied from the spec (not derived):
 *
 *   student       pending → in_progress → submitted   (adjacent edges only)
 *   supervisor    any target from any state
 *   administrator any target from any state
 *
 * `true` entries are the legal pairs; every other pair in the 4×4 grid is
 * refused for that role.
 */
const LEGAL_EDGES: ReadonlyArray<readonly [Role, MilestoneStatus, MilestoneStatus]> = [
  // student — exactly two edges of the chain, nothing else
  ['student', 'pending', 'in_progress'],
  ['student', 'in_progress', 'submitted'],
  // supervisor — all 16 cells
  ['supervisor', 'pending', 'pending'],
  ['supervisor', 'pending', 'in_progress'],
  ['supervisor', 'pending', 'submitted'],
  ['supervisor', 'pending', 'approved'],
  ['supervisor', 'in_progress', 'pending'],
  ['supervisor', 'in_progress', 'in_progress'],
  ['supervisor', 'in_progress', 'submitted'],
  ['supervisor', 'in_progress', 'approved'],
  ['supervisor', 'submitted', 'pending'],
  ['supervisor', 'submitted', 'in_progress'],
  ['supervisor', 'submitted', 'submitted'],
  ['supervisor', 'submitted', 'approved'],
  ['supervisor', 'approved', 'pending'],
  ['supervisor', 'approved', 'in_progress'],
  ['supervisor', 'approved', 'submitted'],
  ['supervisor', 'approved', 'approved'],
  // administrator — all 16 cells
  ['administrator', 'pending', 'pending'],
  ['administrator', 'pending', 'in_progress'],
  ['administrator', 'pending', 'submitted'],
  ['administrator', 'pending', 'approved'],
  ['administrator', 'in_progress', 'pending'],
  ['administrator', 'in_progress', 'in_progress'],
  ['administrator', 'in_progress', 'submitted'],
  ['administrator', 'in_progress', 'approved'],
  ['administrator', 'submitted', 'pending'],
  ['administrator', 'submitted', 'in_progress'],
  ['administrator', 'submitted', 'submitted'],
  ['administrator', 'submitted', 'approved'],
  ['administrator', 'approved', 'pending'],
  ['administrator', 'approved', 'in_progress'],
  ['administrator', 'approved', 'submitted'],
  ['administrator', 'approved', 'approved'],
];

const legalSet = new Set(LEGAL_EDGES.map(([role, from, to]) => `${role}|${from}|${to}`));

/** Every cell of the 48-cell grid, asserted against the spec table. */
const ALL_CELLS: ReadonlyArray<readonly [Role, MilestoneStatus, MilestoneStatus]> = ROLES.flatMap(
  (role) =>
    STATUSES.flatMap((from) => STATUSES.map((to) => [role, from, to] as const)),
);

describe('§11.4 milestone status matrix — cell by cell', () => {
  it('covers every role × from × to cell (48 = 3 × 4 × 4)', () => {
    expect(ALL_CELLS).toHaveLength(48);
    expect(new Set(ALL_CELLS.map((c) => c.join('|'))).size).toBe(48);
  });

  it.each(ALL_CELLS)('%s: %s → %s matches the spec table', (role, from, to) => {
    expect(isStatusTransitionAllowed(role, from, to)).toBe(
      legalSet.has(`${role}|${from}|${to}`),
    );
  });

  it('student legal edges are exactly the adjacent chain (2 of 16 cells)', () => {
    const studentLegal = STATUSES.flatMap((from) =>
      STATUSES.filter((to) => isStatusTransitionAllowed('student', from, to)).map(
        (to) => `${from} → ${to}`,
      ),
    );
    expect(studentLegal).toEqual(['pending → in_progress', 'in_progress → submitted']);
  });

  it('no student edge ever reaches `approved` — the supervisor decides', () => {
    for (const from of STATUSES) {
      expect(isStatusTransitionAllowed('student', from, 'approved')).toBe(false);
    }
  });

  it('supervisor and administrator are symmetric: any from any', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(isStatusTransitionAllowed('supervisor', from, to)).toBe(true);
        expect(isStatusTransitionAllowed('administrator', from, to)).toBe(true);
      }
    }
  });

  it('a same-status cell is never a student "transition" (the service 422s first)', () => {
    for (const status of STATUSES) {
      expect(isStatusTransitionAllowed('student', status, status)).toBe(false);
    }
  });
});

/* ========================================================================== */
/* §5.6 — overdue is COMPUTED at read, never stored, never a target.          */
/* ========================================================================== */

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const past = new Date(NOW - 60_000);
const future = new Date(NOW + 60_000);

describe('§5.6 overdue computation', () => {
  it('past due date + not approved → overdue', () => {
    expect(isOverdue({ dueAt: past, status: 'pending' }, NOW)).toBe(true);
    expect(isOverdue({ dueAt: past, status: 'in_progress' }, NOW)).toBe(true);
    expect(isOverdue({ dueAt: past, status: 'submitted' }, NOW)).toBe(true);
  });

  it('past due date + approved → NOT overdue (approval ends the clock)', () => {
    expect(isOverdue({ dueAt: past, status: 'approved' }, NOW)).toBe(false);
  });

  it('future or equal due date → NOT overdue', () => {
    expect(isOverdue({ dueAt: future, status: 'pending' }, NOW)).toBe(false);
    expect(isOverdue({ dueAt: new Date(NOW), status: 'pending' }, NOW)).toBe(false);
  });

  it('no due date → NOT overdue regardless of status', () => {
    expect(isOverdue({ dueAt: null, status: 'pending' }, NOW)).toBe(false);
    expect(isOverdue({ dueAt: null, status: 'submitted' }, NOW)).toBe(false);
  });
});

describe('§5.6 canonical `state` — overdue overrides the stored status', () => {
  const row = (dueAt: Date | null, status: MilestoneStatus) => ({
    id: '00000000-0000-0000-0000-000000000001',
    projectId: '00000000-0000-0000-0000-000000000002',
    title: 'M',
    description: null,
    position: 0,
    dueAt,
    status,
    completedAt: null,
    createdAt: new Date(NOW - 86_400_000),
    updatedAt: new Date(NOW - 86_400_000),
  });

  it('state = overdue when computed overdue, else the stored status', () => {
    expect(toMilestoneView(row(past, 'pending'), NOW).state).toBe('overdue');
    expect(toMilestoneView(row(past, 'pending'), NOW).overdue).toBe(true);
    expect(toMilestoneView(row(future, 'in_progress'), NOW).state).toBe('in_progress');
    expect(toMilestoneView(row(future, 'in_progress'), NOW).overdue).toBe(false);
    expect(toMilestoneView(row(past, 'approved'), NOW).state).toBe('approved');
  });

  it('the row is never mutated — overdue stays a derived field', () => {
    const source = row(past, 'pending');
    const view = toMilestoneView(source, NOW);
    expect(source.status).toBe('pending'); // stored column untouched
    expect(view).not.toBe(source);
    expect(view.status).toBe('pending');
  });
});
