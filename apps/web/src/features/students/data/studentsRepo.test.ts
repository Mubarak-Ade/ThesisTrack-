import { describe, expect, it } from 'vitest';

import { getStudents } from './studentsRepo';

describe('getStudents', () => {
  it('serves the full mockup snapshot (spec §5.6)', async () => {
    const snap = await getStudents();
    expect(snap.rows).toHaveLength(12); // page size 5 → 3 real pager pages
    expect(snap.stats.total).toBe(1240);
    expect(snap.stats.postgraduates).toBe(412);
    expect(snap.stats.thesisActive).toBe(856);
    expect(snap.stats.riskAlerts).toBe(14);
    expect(snap.infoCards).toHaveLength(3);
  });

  it('every info card declares exactly one action', async () => {
    const snap = await getStudents();
    for (const card of snap.infoCards) {
      expect(Number(Boolean(card.to)) + Number(Boolean(card.toast))).toBe(1);
    }
    expect(snap.infoCards[1]?.to).toBe('/users/import');
    expect(snap.infoCards[1]?.tone).toBe('blue');
  });

  it('rows carry all thesis statuses for the status badges', async () => {
    const snap = await getStudents();
    const statuses = new Set(snap.rows.map((r) => r.thesisStatus));
    expect(statuses).toEqual(new Set(['IN PROGRESS', 'PROPOSED', 'DELAYED', 'COMPLETED']));
  });
});
