import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl } from './http';

/**
 * Spec §18.4 delta (2026-10-25) — the web bundle's API origin is build-time
 * configuration, not a code edit: same-origin by default (`/api/v1`, served by
 * the Vite dev proxy or Docker nginx), absolute when VITE_API_URL points at a
 * split-origin API (Render + Vercel).
 */

describe('resolveApiBaseUrl (VITE_API_URL)', () => {
  it('stays relative (same-origin) when unset or blank', () => {
    expect(resolveApiBaseUrl()).toBe('/api/v1');
    expect(resolveApiBaseUrl('')).toBe('/api/v1');
    expect(resolveApiBaseUrl('   ')).toBe('/api/v1');
  });

  it('joins an absolute API origin (Render)', () => {
    expect(resolveApiBaseUrl('https://thesistrack-api.onrender.com')).toBe(
      'https://thesistrack-api.onrender.com/api/v1',
    );
  });

  it('tolerates trailing slashes instead of producing a double slash', () => {
    expect(resolveApiBaseUrl('https://api.example.com/')).toBe('https://api.example.com/api/v1');
    expect(resolveApiBaseUrl('https://api.example.com///')).toBe(
      'https://api.example.com/api/v1',
    );
  });
});
