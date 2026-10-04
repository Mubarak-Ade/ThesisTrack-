import { describe, expect, it } from 'vitest';

import { mapNotification, mapNotificationsPage } from './mappers';
import type { ListNotificationsArgs } from './types';

const ARGS: ListNotificationsArgs = { page: 1, limit: 20, unreadOnly: false };

describe('mapNotification', () => {
  it('maps a well-formed row', () => {
    const row = mapNotification({
      id: 'n-1',
      type: 'proposal',
      title: 'Proposal approved',
      message: 'Great work.',
      resourceType: 'proposal',
      resourceId: 'p-1',
      readAt: null,
      createdAt: '2026-10-01T10:00:00.000Z',
    });
    expect(row).toEqual({
      id: 'n-1',
      kind: 'proposal',
      title: 'Proposal approved',
      message: 'Great work.',
      resourceType: 'proposal',
      resourceId: 'p-1',
      readAt: null,
      createdAt: '2026-10-01T10:00:00.000Z',
    });
  });

  it('rejects rows without an id or title (skipped, not rendered)', () => {
    expect(mapNotification({ title: 'no id' })).toBeNull();
    expect(mapNotification({ id: 'n-2' })).toBeNull();
    expect(mapNotification('nope')).toBeNull();
  });

  it('defaults an unknown kind to general and tolerates missing fields', () => {
    const row = mapNotification({ id: 'n-3', title: 'Hello', type: 'brand_new_kind' });
    expect(row?.kind).toBe('general');
    expect(row?.message).toBeNull();
    expect(row?.readAt).toBeNull();
    expect(row?.createdAt).toBe('');
  });
});

describe('mapNotificationsPage', () => {
  it('maps the {notifications, pagination} envelope', () => {
    const page = mapNotificationsPage(
      {
        notifications: [
          { id: 'n-1', type: 'general', title: 'A' },
          { id: 'n-2', type: 'deadline', title: 'B', readAt: '2026-10-01T00:00:00.000Z' },
        ],
        pagination: { page: 2, limit: 20, total: 41 },
      },
      ARGS,
    );
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(41);
    expect(page.page).toBe(2);
  });

  it('throws on structure drift so the repo can fall back', () => {
    expect(() => mapNotificationsPage({ items: [] }, ARGS)).toThrow();
    expect(() => mapNotificationsPage(null, ARGS)).toThrow();
  });

  it('drops malformed rows rather than failing the whole page', () => {
    const page = mapNotificationsPage(
      { notifications: [{ id: 'n-1', title: 'ok' }, { title: 'no id' }], pagination: {} },
      ARGS,
    );
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });
});
