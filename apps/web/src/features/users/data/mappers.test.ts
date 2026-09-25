import { describe, expect, it } from 'vitest';

import {
  mapCreatedUser,
  mapImportResult,
  mapUserDetail,
  mapUserDto,
  mapUsersPage,
  toCreateBody,
  toImportPayload,
  withExtras,
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
};

describe('mapUserDto', () => {
  it('maps the pinned PublicUser shape', () => {
    const user = mapUserDto(FULL_USER);
    expect(user).toEqual({
      id: FULL_USER.id,
      firstName: 'Anita',
      lastName: 'Desai',
      email: 'a.desai@student.edu',
      role: 'student',
      status: 'ACTIVE',
      isActive: true,
      createdAt: '2024-01-22T09:00:00.000Z',
      registrationNumber: 'STU-2024-0117',
    });
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

  it('toImportPayload wraps rows as { users: [...] } (§A)', () => {
    const payload = toImportPayload([
      { firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student', department: 'X' },
    ]);
    expect(payload).toEqual({
      users: [{ firstName: 'A', lastName: 'B', email: 'a@b.edu', role: 'student' }],
    });
  });
});

describe('withExtras', () => {
  it('defaults extras and rails, and merges overrides', () => {
    const bare = withExtras(mapUserDto(FULL_USER), null);
    expect(bare.extras).toEqual({ department: null, phone: null, address: null, portalLanguage: null });
    expect(bare.theses).toEqual([]);
    expect(bare.oversight).toEqual({ lastLogin: '—', createdBy: '—', permissions: '—' });

    const merged = withExtras(mapUserDto(FULL_USER), { phone: '+1 (555) 000-0000' });
    expect(merged.extras.phone).toBe('+1 (555) 000-0000');
    expect(merged.extras.department).toBeNull();
  });
});
