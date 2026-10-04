import { describe, expect, it } from 'vitest';

import {
  mapActivity,
  mapFeedback,
  mapMilestone,
  mapProject,
  mapStage,
  mapStageTracker,
  mapSubmission,
  mapVersion,
} from './mappers';

describe('mapProject', () => {
  it('maps a row with its student', () => {
    const row = mapProject({
      id: 'p-1',
      title: 'Ledger',
      description: 'D.',
      status: 'active',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
    });
    expect(row).toMatchObject({
      id: 'p-1',
      title: 'Ledger',
      status: 'active',
      student: { id: 's-1', firstName: 'Ola' },
    });
  });

  it('rejects rows without id or title', () => {
    expect(mapProject({ title: 'x' })).toBeNull();
    expect(mapProject({ id: 'p-1' })).toBeNull();
    expect(mapProject(null)).toBeNull();
  });

  it('coerces an unknown status to active', () => {
    expect(mapProject({ id: 'p-1', title: 'x', status: 'weird' })?.status).toBe('active');
  });
});

describe('mapStage / mapStageTracker', () => {
  const stage = {
    id: 'st-1',
    name: 'Design',
    position: 1,
    status: 'active',
    responsibleRole: 'student',
    dueOffsetDays: 21,
    dueAt: '2026-10-21T00:00:00.000Z',
    overdue: false,
  };

  it('maps flags and computed fields', () => {
    const mapped = mapStage(stage);
    expect(mapped).toMatchObject({
      name: 'Design',
      status: 'active',
      responsibleRole: 'student',
      requiresSubmission: false,
      dueOffsetDays: 21,
      overdue: false,
    });
  });

  it('treats zero stages as a legal 200 (§3.4)', () => {
    expect(mapStageTracker({ stages: [], current: null })).toEqual({
      stages: [],
      current: null,
    });
  });

  it('throws on a missing stages envelope so the repo can fall back', () => {
    expect(() => mapStageTracker({})).toThrow('stages envelope missing');
  });

  it('carries the unmet gates on current (§16.5)', () => {
    const tracker = mapStageTracker({
      stages: [stage],
      current: { ...stage, unmet: ['submission required', 7] },
    });
    expect(tracker.current?.unmet).toEqual(['submission required']);
  });
});

describe('mapMilestone', () => {
  it('keeps the computed `overdue` state but never as a stored status', () => {
    const row = mapMilestone({
      id: 'm-1',
      title: 'Review',
      status: 'overdue',
      state: 'overdue',
      dueAt: '2026-09-01T00:00:00.000Z',
    });
    expect(row).toMatchObject({ status: 'pending', state: 'overdue' });
  });

  it('rejects rows without id or title', () => {
    expect(mapMilestone({ title: 'x' })).toBeNull();
  });

  it('defaults a bad status to pending', () => {
    expect(mapMilestone({ id: 'm-1', title: 'x', status: 'nope' })?.status).toBe('pending');
  });
});

describe('mapSubmission / mapVersion', () => {
  it('maps a submission with submitter', () => {
    const row = mapSubmission({
      id: 'sub-1',
      title: 'Chapter 3',
      status: 'revision_required',
      submitter: { id: 's-1', firstName: 'Ola', lastName: 'N', email: 'o@t.local' },
    });
    expect(row).toMatchObject({ status: 'revision_required', submitter: { id: 's-1' } });
  });

  it('coerces an unknown status to draft', () => {
    expect(mapSubmission({ id: 's', title: 'x', status: 'zzz' })?.status).toBe('draft');
  });

  it('maps a version and defaults the version number to 1', () => {
    const row = mapVersion({ id: 'v-1', body: 'text' });
    expect(row).toMatchObject({ versionNumber: 1, body: 'text', originalFilename: null });
  });

  it('turns an empty-string body into null (§14.2 exactly-one-form reading)', () => {
    expect(mapVersion({ id: 'v-1', body: '' })?.body).toBeNull();
  });
});

describe('mapFeedback / mapActivity', () => {
  it('maps a feedback row with author', () => {
    const row = mapFeedback({
      id: 'f-1',
      body: 'Narrow the scope.',
      updatedAt: '2026-10-01T00:00:00.000Z',
      author: { id: 'u-1', firstName: 'Helen', lastName: 'B', email: 'h@t.local' },
    });
    expect(row).toMatchObject({ body: 'Narrow the scope.', author: { id: 'u-1' } });
  });

  it('rejects feedback without a body', () => {
    expect(mapFeedback({ id: 'f-1' })).toBeNull();
  });

  it('maps an activity entry, actor optional', () => {
    expect(
      mapActivity({ id: 'a-1', at: '2026-10-01T00:00:00.000Z', kind: 'stage.started', summary: 'S' }),
    ).toMatchObject({ kind: 'stage.started', actor: null });
    expect(mapActivity({ id: 'a-1', summary: 'S', actor: { id: 'u-1', name: 'Ada' } })?.actor).toEqual({
      id: 'u-1',
      name: 'Ada',
    });
    expect(mapActivity({ id: 'a-1' })).toBeNull();
  });
});
