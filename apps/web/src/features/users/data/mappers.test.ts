import { describe, expect, it } from 'vitest';

import {
  mapActivityEntries,
  mapCreatedUser,
  mapImportResult,
  mapMilestoneCount,
  mapProjectRefs,
  mapSupervisorName,
  mapUserDetail,
  mapUserDto,
  mapUsersPage,
  toActivityItem,
  toCreateBody,
  toImportPayload,
  withRails,
} from './mappers';

const FULL_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a.desai@student.edu',
  firstName: 'Anita',
  lastName: 'Desai',
  role: 'student',
  isActive: true,
  status: 'ACTIVE',
  createdAt: '2024-01-22T09:00:00.000Z',
  registrationNumber: 'STU-2024-0117',
  program: 'Computer Science',
};

describe('mapUserDto', () => {
  it('maps the pinned PublicUser shape', () => {
    const user = mapUserDto(FULL_USER);
    expect(user).toEqual({
      id: FULL_USER.id,
      code: 'USR-1111',
      firstName: 'Anita',
      lastName: 'Desai',
      email: 'a.desai@student.edu',
      role: 'student',
      status: 'ACTIVE',
      isActive: true,
      createdAt: '2024-01-22T09:00:00.000Z',
      registrationNumber: 'STU-2024-0117',
      program: 'Computer Science',
    });
  });

  it('passes a fixture-provided code through unchanged', () => {
    expect(mapUserDto({ ...FULL_USER, code: 'USR-8821' }).code).toBe('USR-8821');
  });

  it('derives USR-XXXX from the id, falling back to the id when malformed', () => {
    expect(mapUserDto(FULL_USER).code).toBe('USR-1111');
    expect(mapUserDto({ id: 'abc', email: 'x@y.edu' }).code).toBe('abc');
    expect(mapUserDto({ email: 'x@y.edu' }).code).toBe('');
  });

  it('ignores unknown fields', () => {
    const user = mapUserDto({ ...FULL_USER, futureField: { nested: true } });
    expect('futureField' in user).toBe(false);
  });

  it('defaults drifted fields (missing status/role/isActive)', () => {
    const user = mapUserDto({ id: 'x', email: 'x@y.edu', firstName: 'X' });
    expect(user.role).toBe('student');
    expect(user.isActive).toBe(false);
    expect(user.status).toBe('INVITED'); // isActive defaulted false
    expect(user.lastName).toBe('');
    expect(user.createdAt).toBeNull();
    expect(user.registrationNumber).toBeNull();
    expect(user.program).toBeNull(); // §11.0.2: absent → unaffiliated
  });

  it('reads the §11.0.2 program field defensively (null/empty/non-string → null)', () => {
    expect(mapUserDto({ ...FULL_USER, program: 'Data Science' }).program).toBe('Data Science');
    expect(mapUserDto({ ...FULL_USER, program: null }).program).toBeNull();
    expect(mapUserDto({ ...FULL_USER, program: '' }).program).toBeNull();
    expect(mapUserDto({ ...FULL_USER, program: 42 }).program).toBeNull();
    expect(mapUserDto(FULL_USER).program).toBe('Computer Science');
  });

  it('prefers an explicit status over isActive', () => {
    const user = mapUserDto({ ...FULL_USER, status: 'INACTIVE', isActive: true });
    expect(user.status).toBe('INACTIVE');
  });

  it('derives status from isActive when status is missing', () => {
    const user = mapUserDto({ ...FULL_USER, status: undefined, isActive: true });
    expect(user.status).toBe('ACTIVE');
  });
});

describe('mapUsersPage', () => {
  it('maps the pinned list envelope', () => {
    const page = mapUsersPage({ users: [FULL_USER], pagination: { page: 2, limit: 20, total: 57 } });
    expect(page.total).toBe(57);
    expect(page.page).toBe(2);
    expect(page.limit).toBe(20);
    expect(page.items).toHaveLength(1);
  });

  it('throws when the structure drifted (repo falls back)', () => {
    expect(() => mapUsersPage({ data: [] })).toThrow(/users.*missing/i);
    expect(() => mapUsersPage(null)).toThrow();
  });

  it('tolerates a missing/short pagination block', () => {
    const page = mapUsersPage({ users: [FULL_USER] });
    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(1);
  });
});

describe('detail / create / import mappers', () => {
  it('mapUserDetail unwraps { user } and throws on drift', () => {
    expect(mapUserDetail({ user: FULL_USER }).email).toBe('a.desai@student.edu');
    expect(() => mapUserDetail({ account: FULL_USER })).toThrow(/user.*missing/i);
  });

  it('mapCreatedUser prefers the response status, else the user status', () => {
    expect(mapCreatedUser({ user: FULL_USER, status: 'INVITED' }).status).toBe('INVITED');
    expect(mapCreatedUser({ user: FULL_USER }).status).toBe('ACTIVE');
    expect(() => mapCreatedUser({})).toThrow();
  });

  it('mapImportResult reads `created`, falls back to users[], else throws', () => {
    expect(mapImportResult({ created: 5 })).toEqual({ created: 5 });
    expect(mapImportResult({ users: [FULL_USER, FULL_USER] })).toEqual({ created: 2 });
    expect(() => mapImportResult({ ok: true })).toThrow();
  });
});

describe('request-body builders', () => {
  it('toCreateBody trims, lowercases, and drops UI-only fields', () => {
    expect(
      toCreateBody({
        firstName: '  Anita ',
        lastName: 'Desai ',
        email: ' A.Desai@Student.EDU ',
        role: 'student',
        department: 'Informatics',
      }),
    ).toEqual({ firstName: 'Anita', lastName: 'Desai', email: 'a.desai@student.edu', role: 'student' });
  });

  it('toCreateBody carries a trimmed §11.0.2 program when one was given', () => {
    expect(toCreateBody({ firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student', program: '  Data Science  ' })).toEqual(
      {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.edu',
        role: 'student',
        program: 'Data Science',
      },
    );
  });

  it('toCreateBody omits the program key entirely when blank (never `program: ""`)', () => {
    const blank = toCreateBody({ firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student', program: '   ' });
    expect('program' in blank).toBe(false);
    const absent = toCreateBody({ firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student' });
    expect('program' in absent).toBe(false);
    expect(Object.keys(toCreateBody({ firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student', program: '' }))).not.toContain(
      'program',
    );
  });

  it('toImportPayload wraps rows as { users: [...] } (§A) and passes program per row', () => {
    const payload = toImportPayload([
      { firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student', department: 'X', program: 'MSc CS' },
      { firstName: 'C', lastName: 'D', email: 'c@d.edu', role: 'supervisor', program: '  ' },
    ]);
    expect(payload).toEqual({
      users: [
        { firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student', program: 'MSc CS' },
        { firstName: 'C', lastName: 'D', email: 'c@d.edu', role: 'supervisor' },
      ],
    });
    expect('program' in payload.users[1]!).toBe(false);
  });
});

describe('withRails', () => {
  it('carries the live rails, keeps extras empty, and never drops the flag', () => {
    const detail = withRails(mapUserDto(FULL_USER), {
      theses: [],
      milestones: 4,
      activity: [],
      oversight: { lastLogin: '—', createdBy: '—', permissions: 'Student' },
      railsError: false,
    });
    expect(detail.extras).toEqual({ department: null, phone: null, address: null, portalLanguage: null });
    expect(detail.milestones).toBe(4);
    expect(detail.railsError).toBe(false);
    expect(detail.theses).toEqual([]);
    expect(detail.oversight.permissions).toBe('Student');
  });
});

describe('profile rail mappers (§16.3)', () => {
  it('mapProjectRefs reads rows and throws on structure drift', () => {
    const refs = mapProjectRefs({
      projects: [{ id: 'p1', title: 'Thesis', status: 'active', updatedAt: '2026-10-01T00:00:00.000Z' }],
    });
    expect(refs[0]).toEqual({ id: 'p1', title: 'Thesis', status: 'active', updatedAt: '2026-10-01T00:00:00.000Z' });
    // Field-level drift defaults; structure-level drift throws.
    expect(mapProjectRefs({ projects: [{ id: 'p2' }] })[0]).toMatchObject({ status: 'unknown', title: '' });
    expect(() => mapProjectRefs({ data: [] })).toThrow(/projects.*missing/i);
  });

  it('mapSupervisorName derives "First Last" / "Unassigned" / drift', () => {
    expect(mapSupervisorName({ active: { supervisor: { firstName: 'Elena', lastName: 'Rossi' } } })).toBe('Elena Rossi');
    expect(mapSupervisorName({ active: null })).toBe('Unassigned'); // no assignment is not drift
    expect(mapSupervisorName({ active: { supervisor: null } })).toBe('Unassigned');
    expect(() => mapSupervisorName({ data: {} })).toThrow(/active.*missing/i);
  });

  it('mapMilestoneCount counts rows and throws on drift', () => {
    expect(mapMilestoneCount({ milestones: [{ id: 'm1' }, { id: 'm2' }] })).toBe(2);
    expect(mapMilestoneCount({ milestones: [] })).toBe(0);
    expect(() => mapMilestoneCount({ data: [] })).toThrow(/milestones.*missing/i);
  });

  it('mapActivityEntries reads kind/summary/at and parses the sort key', () => {
    const entries = mapActivityEntries({
      activity: [{ kind: 'submission.created', summary: 'Draft uploaded', at: '2026-10-01T10:00:00.000Z' }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'submission.created', summary: 'Draft uploaded' });
    expect(entries[0]!.atMs).toBeGreaterThan(0);
    expect(() => mapActivityEntries({ data: [] })).toThrow(/activity.*missing/i);
  });

  it('toActivityItem maps kinds to icons and formats the relative time', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const now = new Date('2026-10-06T10:00:00.000Z').getTime();
    const base = { at, atMs: new Date(at).getTime() };
    expect(toActivityItem({ ...base, kind: 'submission.created', summary: 'Draft uploaded' }, now)).toEqual({
      iconKind: 'upload',
      strong: 'Draft uploaded',
      when: '5 days ago',
    });
    expect(toActivityItem({ ...base, kind: 'proposal.reviewed', summary: 'Proposal approved' }, now).iconKind).toBe('approve');
    expect(toActivityItem({ ...base, kind: 'stage.started', summary: 'Stage started' }, now).iconKind).toBe('system');
    // Unparseable `at` → honest em-dash, never a bogus date.
    expect(toActivityItem({ kind: 'x', summary: 'y', at: '', atMs: 0 }, now).when).toBe('—');
  });
});
