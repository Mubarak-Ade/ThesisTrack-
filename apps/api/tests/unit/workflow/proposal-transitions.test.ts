import { describe, expect, it } from 'vitest';

import {
  PROPOSAL_ACTION_ROLES,
  PROPOSAL_TRANSITIONS,
  type ProposalAction,
} from '../../../src/modules/proposals/service.js';

/**
 * Phase 3 unit test — the §5.4 transition table.
 *
 * `requireWorkflow` refuses every pair this table does not list, so pinning
 * the table here pins the whole layer-3 behavior of the proposals module:
 * each legal edge, every illegal edge, and the §4.5 roles per action.
 */

const STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
] as const;

/** The exact legal edges, spelled out from spec §5.4 (not derived). */
const LEGAL_EDGES = [
  ['patch', 'draft'],
  ['patch', 'revision_required'],
  ['attach', 'draft'],
  ['attach', 'revision_required'],
  ['detach', 'draft'],
  ['detach', 'revision_required'],
  ['submit', 'draft'],
  ['submit', 'revision_required'],
  ['start-review', 'submitted'],
  ['review', 'under_review'],
] as const satisfies ReadonlyArray<readonly [ProposalAction, (typeof STATUSES)[number]]>;

const ACTIONS = Object.keys(PROPOSAL_TRANSITIONS) as ProposalAction[];

describe('proposal transitions (spec §5.4)', () => {
  it('is exactly the §5.4 table — copied, not invented', () => {
    expect(PROPOSAL_TRANSITIONS).toEqual({
      patch: ['draft', 'revision_required'],
      attach: ['draft', 'revision_required'],
      detach: ['draft', 'revision_required'],
      submit: ['draft', 'revision_required'],
      'start-review': ['submitted'],
      review: ['under_review'],
    });
  });

  it('has six actions', () => {
    expect(ACTIONS.sort()).toEqual(
      ['attach', 'detach', 'patch', 'review', 'start-review', 'submit'].sort(),
    );
  });

  it.each(LEGAL_EDGES)("%s is legal from '%s'", (action, status) => {
    expect(PROPOSAL_TRANSITIONS[action]).toContain(status);
  });

  it('rejects every pair the table does not list', () => {
    const legal = new Set<string>(LEGAL_EDGES.map(([action, status]) => `${action}:${status}`));
    let checked = 0;
    for (const action of ACTIONS) {
      for (const status of STATUSES) {
        if (!legal.has(`${action}:${status}`)) {
          expect(PROPOSAL_TRANSITIONS[action]).not.toContain(status);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(ACTIONS.length * STATUSES.length - LEGAL_EDGES.length); // 26
  });

  it('keeps approved and rejected terminal for every action', () => {
    for (const action of ACTIONS) {
      expect(PROPOSAL_TRANSITIONS[action]).not.toContain('approved');
      expect(PROPOSAL_TRANSITIONS[action]).not.toContain('rejected');
    }
  });

  it('never names a status outside the enum', () => {
    for (const action of ACTIONS) {
      for (const status of PROPOSAL_TRANSITIONS[action]) {
        expect(STATUSES).toContain(status);
      }
    }
  });

  it('offers no action that starts from nothing', () => {
    for (const action of ACTIONS) {
      expect(PROPOSAL_TRANSITIONS[action].length).toBeGreaterThan(0);
    }
  });
});

describe('proposal action roles (spec §4.5)', () => {
  it('matches the RBAC rows for each endpoint', () => {
    expect(PROPOSAL_ACTION_ROLES).toEqual({
      patch: ['student'],
      attach: ['student'],
      detach: ['student'],
      submit: ['student'],
      'start-review': ['supervisor', 'administrator'],
      review: ['supervisor', 'administrator'],
    });
  });

  it('assigns roles to every action and no others', () => {
    expect(Object.keys(PROPOSAL_ACTION_ROLES).sort()).toEqual(ACTIONS.sort());
  });

  it('never permits an edit-family action outside the owning student', () => {
    for (const action of ['patch', 'attach', 'detach', 'submit'] as const) {
      expect(PROPOSAL_ACTION_ROLES[action]).toEqual(['student']);
    }
  });
});
