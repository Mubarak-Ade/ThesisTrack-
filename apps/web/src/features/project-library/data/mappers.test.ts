import { describe, expect, it } from 'vitest';

import {
  mapDepartmentFacet,
  mapLibraryDetail,
  mapLibraryPage,
  mapLibraryRow,
  mapSimilarMatches,
} from './mappers';

/**
 * Mapper contract for the project library (ADR-18). The client projection is
 * deliberately narrower than the API row: an unexpected `email` or `body` key
 * must never survive the mapping.
 */

const ROW = {
  id: 'project-1',
  title: 'Photovoltaic scheduling ledger',
  description: 'Matches solar generation to campus load.',
  status: 'active',
  session: '2025/2026',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  student: { id: 'student-1', firstName: 'Ola', lastName: 'Nordmann' },
  department: { id: 'dept-1', name: 'Informatics', code: 'INF' },
  supervisors: [{ id: 'supervisor-1', firstName: 'Ada', lastName: 'Lovelace' }],
  score: 0.42,
  excerpt: '…a shared ledger…',
};

describe('mapLibraryRow', () => {
  it('maps a full API row', () => {
    expect(mapLibraryRow(ROW)).toEqual(ROW);
  });

  it('turns missing optional fields into null and []', () => {
    const row = mapLibraryRow({
      id: 'project-2',
      title: 'Coral reef survey',
      status: 'archived',
    });

    expect(row).not.toBeNull();
    expect(row!.description).toBe('');
    expect(row!.session).toBeNull();
    expect(row!.department).toBeNull();
    expect(row!.supervisors).toEqual([]);
    expect(row!.score).toBeNull();
    expect(row!.excerpt).toBeNull();
    expect(row!.student).toEqual({ id: '', firstName: '', lastName: '' });
  });

  it('drops malformed rows instead of throwing', () => {
    expect(mapLibraryRow(null)).toBeNull();
    expect(mapLibraryRow({ title: 'No id', status: 'active' })).toBeNull();
    expect(mapLibraryRow({ id: 'x', title: 'No status' })).toBeNull();
    expect(mapLibraryRow({ id: 'x', title: 'Bad status', status: 'deleted' })).toBeNull();
  });

  it('ignores unexpected email/body style keys (defensive projection)', () => {
    const row = mapLibraryRow({
      ...ROW,
      email: 'leak@test.local',
      body: '<p>full proposal body</p>',
      student: { ...ROW.student, email: 'leak@test.local' },
      supervisors: [{ ...ROW.supervisors[0], email: 'leak@test.local' }],
    });

    expect(row).not.toBeNull();
    expect(Object.keys(row!).sort()).not.toContain('email');
    expect(Object.keys(row!).sort()).not.toContain('body');
    expect(Object.keys(row!.student).sort()).toEqual(['firstName', 'id', 'lastName']);
    expect(JSON.stringify(row)).not.toContain('leak@test.local');
    expect(JSON.stringify(row)).not.toContain('full proposal body');
  });
});

describe('mapLibraryPage', () => {
  it('maps the envelope and the department facet', () => {
    const page = mapLibraryPage(
      {
        projects: [ROW, { id: 'broken' }],
        departments: [
          { id: 'dept-1', name: 'Informatics', count: 4 },
          { name: 'No id' },
        ],
        pagination: { page: 2, limit: 10, total: 11 },
      },
      { page: 1, limit: 10 },
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('project-1');
    expect(page.departments).toEqual([{ id: 'dept-1', name: 'Informatics', count: 4 }]);
    expect(page.page).toBe(2);
    expect(page.total).toBe(11);
  });

  it('throws when the projects envelope is missing', () => {
    expect(() => mapLibraryPage({}, { page: 1, limit: 10 })).toThrow();
  });
});

describe('mapLibraryDetail', () => {
  it('maps the project and its similar rows', () => {
    const detail = mapLibraryDetail({ project: ROW, similar: [ROW, null] });
    expect(detail?.project.id).toBe('project-1');
    expect(detail?.similar).toHaveLength(1);
  });

  it('returns null when the project row is malformed', () => {
    expect(mapLibraryDetail({ similar: [ROW] })).toBeNull();
  });
});

describe('mapSimilarMatches and facets', () => {
  it('returns [] for an absent matches array', () => {
    expect(mapSimilarMatches({})).toEqual([]);
  });

  it('drops a malformed facet', () => {
    expect(mapDepartmentFacet({ id: 'dept-1' })).toBeNull();
    expect(mapDepartmentFacet({ id: 'dept-1', name: 'Informatics' })).toEqual({
      id: 'dept-1',
      name: 'Informatics',
      count: 0,
    });
  });
});
