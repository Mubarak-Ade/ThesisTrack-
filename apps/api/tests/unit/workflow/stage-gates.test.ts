import { describe, expect, it } from 'vitest';

import {
  buildStageSnapshotValues,
  evaluateGates,
  stageHasAnyGate,
} from '../../../src/modules/workflows/service.js';
import type { GateFacts, GateFields, WorkflowStageRow } from '../../../src/modules/workflows/types.js';

/**
 * Phase 4 unit test — the §11.14 gate table (spec §11.14, §5.9, ADR-15).
 *
 * Three pure behaviors pinned here:
 *
 *   1. `stageHasAnyGate` — the §5.9 predicate: a stage advances freely when
 *      it gates on nothing (vacuous truth), which is what lets seeds keep
 *      stage 1 ungated and what decides whether an approval auto-advances.
 *   2. `evaluateGates` — the truth table over 8 flag combinations × the four
 *      fact columns, including the `requires_approval` OR-branch (proposal
 *      approved §5.4 OR an in-window submission reviewed `approved`) and the
 *      unmet-list order, which is what the 422 `details[].path = 'unmet'`
 *      entries and §16.5's disabled button render in.
 *   3. `buildStageSnapshotValues` — the ADR-15 frozen snapshot: every
 *      descriptive/gating field copied from the definition, position 1 active
 *      with `started_at`/`started_by` set, every later stage pending.
 */

const NO_FACTS: GateFacts = {
  proposalApproved: false,
  submissionInWindow: false,
  reviewedSubmissionInWindow: false,
  approvedReviewedSubmissionInWindow: false,
};

const facts = (over: Partial<GateFacts>): GateFacts => ({ ...NO_FACTS, ...over });

const flags = (
  requiresSubmission: boolean,
  requiresReview: boolean,
  requiresApproval: boolean,
): GateFields => ({ requiresSubmission, requiresReview, requiresApproval });

const UNGATED = flags(false, false, false);

/* ========================================================================== */
/* stageHasAnyGate — §5.9's "is this stage gated at all?"                     */
/* ========================================================================== */

describe('stageHasAnyGate — all 8 flag combinations', () => {
  const COMBOS: ReadonlyArray<readonly [boolean, boolean, boolean]> = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ];

  it.each(COMBOS)('submission=%j review=%j approval=%j', (s, r, a) => {
    expect(stageHasAnyGate(flags(s, r, a))).toBe(s || r || a);
  });

  it('an ungated stage has no gate — that is what makes it freely advanceable', () => {
    expect(stageHasAnyGate(UNGATED)).toBe(false);
  });
});

/* ========================================================================== */
/* evaluateGates — the §11.14 truth table                                     */
/* ========================================================================== */

describe('evaluateGates — ungated stage is vacuously met', () => {
  const ALL_FACTS: GateFacts[] = [
    NO_FACTS,
    facts({ proposalApproved: true }),
    facts({ submissionInWindow: true }),
    facts({ reviewedSubmissionInWindow: true }),
    facts({ approvedReviewedSubmissionInWindow: true }),
    facts({
      proposalApproved: true,
      submissionInWindow: true,
      reviewedSubmissionInWindow: true,
      approvedReviewedSubmissionInWindow: true,
    }),
  ];

  it.each(ALL_FACTS)('ungated stage against any facts → []', (f) => {
    expect(evaluateGates(UNGATED, f)).toEqual([]);
  });
});

describe('evaluateGates — single-flag rows', () => {
  it('requires_submission: met only by an in-window submission', () => {
    const stage = flags(true, false, false);
    expect(evaluateGates(stage, NO_FACTS)).toEqual(['requires_submission']);
    // Other facts do NOT substitute for a submission.
    expect(
      evaluateGates(stage, facts({ reviewedSubmissionInWindow: true, proposalApproved: true })),
    ).toEqual(['requires_submission']);
    expect(evaluateGates(stage, facts({ submissionInWindow: true }))).toEqual([]);
  });

  it('requires_review: met only by a reviewed in-window submission', () => {
    const stage = flags(false, true, false);
    expect(evaluateGates(stage, NO_FACTS)).toEqual(['requires_review']);
    // A submission alone does not satisfy a review gate.
    expect(evaluateGates(stage, facts({ submissionInWindow: true }))).toEqual(['requires_review']);
    expect(evaluateGates(stage, facts({ reviewedSubmissionInWindow: true }))).toEqual([]);
  });

  it('requires_approval: met by the §5.4 proposal branch', () => {
    const stage = flags(false, false, true);
    expect(evaluateGates(stage, NO_FACTS)).toEqual(['requires_approval']);
    expect(evaluateGates(stage, facts({ proposalApproved: true }))).toEqual([]);
  });

  it('requires_approval: met by an in-window submission reviewed `approved`', () => {
    const stage = flags(false, false, true);
    expect(
      evaluateGates(stage, facts({ approvedReviewedSubmissionInWindow: true })),
    ).toEqual([]);
  });

  it('requires_approval: a NON-approved review does not satisfy it', () => {
    const stage = flags(false, false, true);
    expect(
      evaluateGates(
        stage,
        facts({ reviewedSubmissionInWindow: true, submissionInWindow: true }),
      ),
    ).toEqual(['requires_approval']);
  });

  it('requires_approval: a submission without a review does not satisfy it', () => {
    const stage = flags(false, false, true);
    expect(evaluateGates(stage, facts({ submissionInWindow: true }))).toEqual([
      'requires_approval',
    ]);
  });
});

describe('evaluateGates — combined flags, fixed column order', () => {
  it('all three flags unmet → snake_case names in column order', () => {
    expect(evaluateGates(flags(true, true, true), NO_FACTS)).toEqual([
      'requires_submission',
      'requires_review',
      'requires_approval',
    ]);
  });

  it('the proposal branch can clear only requires_approval — the rest stay', () => {
    expect(evaluateGates(flags(true, true, true), facts({ proposalApproved: true }))).toEqual([
      'requires_submission',
      'requires_review',
    ]);
  });

  it('submission + review met, approval unmet → only requires_approval', () => {
    expect(
      evaluateGates(
        flags(true, true, true),
        facts({ submissionInWindow: true, reviewedSubmissionInWindow: true }),
      ),
    ).toEqual(['requires_approval']);
  });

  it('every fact true → [] for all three flags', () => {
    expect(
      evaluateGates(
        flags(true, true, true),
        facts({
          proposalApproved: true,
          submissionInWindow: true,
          reviewedSubmissionInWindow: true,
          approvedReviewedSubmissionInWindow: true,
        }),
      ),
    ).toEqual([]);
  });

  it('middle flag alone among pairs keeps its position in the list', () => {
    expect(evaluateGates(flags(false, true, true), NO_FACTS)).toEqual([
      'requires_review',
      'requires_approval',
    ]);
    expect(evaluateGates(flags(true, false, true), NO_FACTS)).toEqual([
      'requires_submission',
      'requires_approval',
    ]);
    expect(evaluateGates(flags(true, true, false), NO_FACTS)).toEqual([
      'requires_submission',
      'requires_review',
    ]);
  });
});

/* ========================================================================== */
/* buildStageSnapshotValues — ADR-15's frozen materialisation                 */
/* ========================================================================== */

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const STARTER_ID = '22222222-2222-4222-8222-222222222222';

function defStage(
  position: number,
  over: Partial<WorkflowStageRow> = {},
): WorkflowStageRow {
  return {
    id: `33333333-3333-4333-8333-${String(position).padStart(12, '0')}`,
    workflowId: '44444444-4444-4444-8444-444444444444',
    position,
    name: `Stage ${position}`,
    description: `Description ${position}`,
    dueOffsetDays: position * 7,
    deliverable: `Deliverable ${position}`,
    responsibleRole: 'supervisor',
    requiresSubmission: false,
    requiresReview: false,
    requiresApproval: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  } as WorkflowStageRow;
}

describe('buildStageSnapshotValues — ADR-15 frozen snapshot', () => {
  const stages = [
    defStage(1, { requiresApproval: true, responsibleRole: 'administrator' }),
    defStage(2, { requiresSubmission: true, requiresReview: true }),
    defStage(3),
  ];

  it('one row per definition stage, positions preserved', () => {
    const rows = buildStageSnapshotValues(stages, PROJECT_ID, STARTER_ID);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.projectId)).toEqual([PROJECT_ID, PROJECT_ID, PROJECT_ID]);
    expect(rows.map((r) => r.workflowStageId)).toEqual(stages.map((s) => s.id));
  });

  it('stage 1 is active with started_at/started_by; the rest are pending', () => {
    const rows = buildStageSnapshotValues(stages, PROJECT_ID, STARTER_ID);
    expect(rows[0].status).toBe('active');
    expect(rows[0].startedAt).toBeInstanceOf(Date);
    expect(rows[0].startedBy).toBe(STARTER_ID);
    for (const row of rows.slice(1)) {
      expect(row.status).toBe('pending');
      expect(row.startedAt).toBeNull();
      expect(row.startedBy).toBeNull();
    }
    for (const row of rows) {
      expect(row.completedAt).toBeNull();
      expect(row.completedBy).toBeNull();
    }
  });

  it('copies every descriptive and gating field from the definition', () => {
    const rows = buildStageSnapshotValues(stages, PROJECT_ID, STARTER_ID);
    rows.forEach((row, i) => {
      const stage = stages[i];
      expect(row.name).toBe(stage.name);
      expect(row.description).toBe(stage.description);
      expect(row.dueOffsetDays).toBe(stage.dueOffsetDays);
      expect(row.deliverable).toBe(stage.deliverable);
      expect(row.responsibleRole).toBe(stage.responsibleRole);
      expect(row.requiresSubmission).toBe(stage.requiresSubmission);
      expect(row.requiresReview).toBe(stage.requiresReview);
      expect(row.requiresApproval).toBe(stage.requiresApproval);
    });
  });

  it('the gate flags travel with the snapshot — later definition edits cannot move it', () => {
    const rows = buildStageSnapshotValues(stages, PROJECT_ID, STARTER_ID);
    expect(rows[0].requiresApproval).toBe(true);
    expect(rows[1].requiresSubmission && rows[1].requiresReview).toBe(true);
    expect(rows[2].requiresSubmission).toBe(false);
  });

  it('an empty definition yields zero rows — approval never fails on workflow data', () => {
    expect(buildStageSnapshotValues([], PROJECT_ID, STARTER_ID)).toEqual([]);
  });
});
