import { describe, expect, it } from 'vitest';

import {
  listLibraryQuerySchema,
  projectLibraryParamsSchema,
  similarityCheckSchema,
} from '../../src/modules/project-library/schema.js';
import { similarProjectsQuerySchema } from '../../src/modules/proposals/schema.js';

/**
 * Project library request contracts — design 2026-11-05 (ADR-18).
 *
 * These are pure Zod checks: no database, no HTTP. They pin the defaults the
 * web UI relies on (10 per page, status `all`) and the bounds the API promises.
 */

describe('listLibraryQuerySchema', () => {
  it('applies the library defaults', () => {
    const parsed = listLibraryQuerySchema.parse({});

    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(10);
    expect(parsed.status).toBe('all');
  });

  it('trims q', () => {
    expect(listLibraryQuerySchema.parse({ q: '  photovoltaic  ' }).q).toBe('photovoltaic');
  });

  it('rejects q longer than 200 characters', () => {
    expect(() => listLibraryQuerySchema.parse({ q: 'x'.repeat(201) })).toThrow();
    expect(listLibraryQuerySchema.parse({ q: 'x'.repeat(200) }).q).toHaveLength(200);
  });

  it('rejects page below 1', () => {
    expect(() => listLibraryQuerySchema.parse({ page: '0' })).toThrow();
  });

  it('caps limit at 50, not the generic 100', () => {
    expect(() => listLibraryQuerySchema.parse({ limit: '51' })).toThrow();
    expect(listLibraryQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it('accepts every status and rejects an unknown one', () => {
    for (const status of ['all', 'active', 'completed', 'archived'] as const) {
      expect(listLibraryQuerySchema.parse({ status }).status).toBe(status);
    }
    expect(() => listLibraryQuerySchema.parse({ status: 'deleted' })).toThrow();
  });

  it('requires departmentId to be a UUID when present', () => {
    expect(() => listLibraryQuerySchema.parse({ departmentId: 'not-a-uuid' })).toThrow();
    expect(
      listLibraryQuerySchema.parse({ departmentId: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' })
        .departmentId,
    ).toBe('8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d');
  });
});

describe('projectLibraryParamsSchema', () => {
  it('requires a UUID projectId', () => {
    expect(projectLibraryParamsSchema.parse({
      projectId: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }).projectId).toBe('8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d');
    expect(() => projectLibraryParamsSchema.parse({ projectId: 'library' })).toThrow();
  });
});

describe('similarityCheckSchema', () => {
  it('trims title and description', () => {
    const parsed = similarityCheckSchema.parse({
      title: '  Campus ledger ',
      description: '  Photovoltaic scheduling  ',
    });

    expect(parsed.title).toBe('Campus ledger');
    expect(parsed.description).toBe('Photovoltaic scheduling');
  });

  it('requires a non-empty title and description', () => {
    expect(() => similarityCheckSchema.parse({ description: 'x' })).toThrow();
    expect(() => similarityCheckSchema.parse({ title: 'x' })).toThrow();
    expect(() => similarityCheckSchema.parse({ title: '   ', description: 'x' })).toThrow();
    expect(() => similarityCheckSchema.parse({ title: 'x', description: '   ' })).toThrow();
  });

  it('rejects overlong input', () => {
    expect(() =>
      similarityCheckSchema.parse({ title: 'x'.repeat(501), description: 'd' }),
    ).toThrow();
    expect(() =>
      similarityCheckSchema.parse({ title: 't', description: 'd'.repeat(10001) }),
    ).toThrow();
  });

  it('accepts an optional UUID excludeProjectId', () => {
    expect(
      similarityCheckSchema.parse({
        title: 't',
        description: 'd',
        excludeProjectId: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      }).excludeProjectId,
    ).toBe('8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d');
    expect(() =>
      similarityCheckSchema.parse({ title: 't', description: 'd', excludeProjectId: 'x' }),
    ).toThrow();
  });
});

describe('similarProjectsQuerySchema', () => {
  it('defaults to 5 and accepts 1..10', () => {
    expect(similarProjectsQuerySchema.parse({}).limit).toBe(5);
    expect(similarProjectsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(similarProjectsQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('rejects a limit outside 1..10', () => {
    expect(() => similarProjectsQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => similarProjectsQuerySchema.parse({ limit: '11' })).toThrow();
  });
});
