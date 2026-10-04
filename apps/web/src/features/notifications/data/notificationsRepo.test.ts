import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listNotifications, markAllRead, markRead } from './notificationsRepo';
import { NOTIFICATION_FIXTURES } from './mock/fixtures';

vi.mock('@/lib/api/http', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const { api } = await import('@/lib/api/http');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('listNotifications', () => {
  it('returns the live page and passes unread=true when filtered', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      notifications: [{ id: 'n-1', type: 'review', title: 'Reviewed' }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const page = await listNotifications({ page: 1, limit: 20, unreadOnly: true });
    expect(api.get).toHaveBeenCalledWith('/notifications?page=1&limit=20&unread=true');
    expect(page.items).toHaveLength(1);
    expect(page.items[0].kind).toBe('review');
    expect(page.usedFallback).toBe(false);
  });

  it('falls back to fixtures with usedFallback on any error', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'));

    const page = await listNotifications({ page: 1, limit: 20, unreadOnly: false });
    expect(page.usedFallback).toBe(true);
    expect(page.items).toEqual(NOTIFICATION_FIXTURES);
  });

  it('fixture fallback honours the unread filter', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'));

    const page = await listNotifications({ page: 1, limit: 20, unreadOnly: true });
    expect(page.items.every((row) => row.readAt === null)).toBe(true);
  });
});

describe('writes never fake success (§10.4)', () => {
  it('markRead surfaces the API error', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('404 not yours'));
    await expect(markRead('n-1')).rejects.toThrow('404 not yours');
  });

  it('markRead rejects a malformed envelope instead of pretending', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({});
    await expect(markRead('n-1')).rejects.toThrow('Malformed mark-read response');
  });

  it('markAllRead returns the updated count', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ updated: 7 });
    await expect(markAllRead()).resolves.toBe(7);
  });
});
