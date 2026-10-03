import { describe, expect, it } from 'vitest';

import {
  SUBMISSION_ACTION_ROLES,
  SUBMISSION_TRANSITIONS,
  type SubmissionAction,
} from '../../../src/modules/submissions/service.js';

/**
 * Phase 5 unit test — the §5.5 transition table.
 *
 * `requireWorkflow` refuses every pair this table does not list, so pinning
 * the table here pins the whole layer-3 behavior of the submissions module:
 * each legal edge, every illegal edge, and the §4.5 roles per action.
 *
 * The table is transcribed from spec §5.5 (LOCKED flow) + §11.5 (endpoint
 * columns), not derived from the code:
 *
 *   patch / delete  → draft only                (§11.5 "draft only")
 *   submit          → draft only                (§5.5 DRAFT ──submit──► SUBMITTED)
 *   append          → draft | revision_required (§5.5's optional attach step
 *                     and its revision arrow — no edge out of a decided state)
 */

const STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
] as const;

/** The exact legal edges, spelled out from spec §5.5/§11.5 (not derived). */
const LEGAL_EDGES = [
  ['patch', 'draft'],
  ['delete', 'draft'],
  ['submit', 'draft'],
  ['append', 'draft'],
  ['append', 'revision_required'],
] as const satisfies ReadonlyArray<readonly [SubmissionAction, (typeof STATUSES)[number]]>;

const ACTIONS = Object.keys(SUBMISSION_TRANSITIONS) as SubmissionAction[];

describe('submission transitions (spec §5.5, §11.5)', () => {
  it('is exactly the §5.5 table — copied, not invented', () => {
    expect(SUBMISSION_TRANSITIONS).toEqual({
      patch: ['draft'],
      delete: ['draft'],
      submit: ['draft'],
      append: ['draft', 'revision_required'],
    });
  });

  it('has four actions', () => {
    expect(ACTIONS.sort()).toEqual(['append', 'delete', 'patch', 'submit'].sort());
  });

  it.each(LEGAL_EDGES)("%s is legal from '%s'", (action, status) => {
    expect(SUBMISSION_TRANSITIONS[action]).toContain(status);
  });

  it('rejects every pair the table does not list', () => {
    const legal = new Set<string>(LEGAL_EDGES.map(([action, status]) => `${action}:${status}`));
    let checked = 0;
    for (const action of ACTIONS) {
      for (const status of STATUSES) {
        if (!legal.has(`${action}:${status}`)) {
          expect(SUBMISSION_TRANSITIONS[action]).not.toContain(status);
          checked += 1;
        }
      }
    }
    // 4 actions × 6 statuses − 5 legal edges = 19 refused pairs.
    expect(checked).toBe(19);
  });

  it('never mutates a decided submission (approved/rejected are terminal)', () => {
    for (const action of ACTIONS) {
      expect(SUBMISSION_TRANSITIONS[action]).not.toContain('approved');
      expect(SUBMISSION_TRANSITIONS[action]).not.toContain('rejected');
    }
  });

  it('refuses append while a review is in flight (§5.5 shows no such edge)', () => {
    expect(SUBMISSION_TRANSITIONS.append).not.toContain('under_review');
    expect(SUBMISSION_TRANSITIONS.append).not.toContain('submitted');
  });

  it('scopes every action to students (§4.5 "Submission — … (own)")', () => {
    expect(SUBMISSION_ACTION_ROLES).toEqual({
      patch: ['student'],
      delete: ['student'],
      submit: ['student'],
      append: ['student'],
    });
    for (const action of ACTIONS) {
      expect(SUBMISSION_ACTION_ROLES[action]).toEqual(['student']);
    }
  });
});
