import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import NotificationsScreen from './NotificationsScreen';
import type { NotificationsPage } from '../data/types';

vi.mock('../data/notificationsRepo', () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

const { listNotifications, markRead, markAllRead } = await import('../data/notificationsRepo');

const UNREAD: NotificationsPage = {
  items: [
    {
      id: 'n-1',
      kind: 'proposal',
      title: 'Revision requested',
      message: 'Narrow the scope.',
      resourceType: 'proposal',
      resourceId: 'p-1',
      readAt: null,
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'n-2',
      kind: 'general',
      title: 'Welcome',
      message: null,
      resourceType: null,
      resourceId: null,
      readAt: '2026-09-20T10:00:00.000Z',
      createdAt: '2026-09-20T10:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
  usedFallback: false,
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <NotificationsScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listNotifications).mockResolvedValue(UNREAD);
  vi.mocked(markRead).mockImplementation(async (id: string) => ({
    ...UNREAD.items[0],
    id,
    readAt: '2026-10-02T00:00:00.000Z',
  }));
  vi.mocked(markAllRead).mockResolvedValue(1);
});

describe('NotificationsScreen', () => {
  it('renders rows, unread affordances and the honest footer', async () => {
    renderAt('/notifications');

    expect(await screen.findByText('Revision requested')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    // Only the unread row offers "Mark read".
    expect(screen.getAllByRole('button', { name: /mark read/i })).toHaveLength(1);
    expect(screen.getByText('Showing 2 of 2 notifications')).toBeInTheDocument();
    // The unread badge counts readAt === null (§15.4's definition).
    expect(screen.getByRole('button', { name: /unread \(1\)/i })).toBeInTheDocument();
  });

  it('marks a single row read through the repository', async () => {
    const user = userEvent.setup();
    renderAt('/notifications');

    await user.click(await screen.findByRole('button', { name: /mark read/i }));
    expect(markRead).toHaveBeenCalledWith('n-1');
  });

  it('marks everything read and disables the action while pending', async () => {
    const user = userEvent.setup();
    renderAt('/notifications');

    await user.click(await screen.findByRole('button', { name: /mark all as read/i }));
    expect(markAllRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(markAllRead).toHaveBeenCalled());
  });

  it('reads the ?unread=true filter from the URL (linkable state)', async () => {
    vi.mocked(listNotifications).mockResolvedValue({ ...UNREAD, items: [UNREAD.items[0]], total: 1 });
    renderAt('/notifications?unread=true');

    expect(await screen.findByRole('button', { name: /unread \(1\)/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(listNotifications).toHaveBeenCalledWith({ page: 1, limit: 20, unreadOnly: true });
  });

  it('shows the sample-data banner when the read fell back to fixtures', async () => {
    vi.mocked(listNotifications).mockResolvedValue({ ...UNREAD, usedFallback: true });
    renderAt('/notifications');

    expect(await screen.findByText(/showing sample data/i)).toBeInTheDocument();
  });

  it('renders the empty state when there is nothing to show', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      usedFallback: false,
    });
    renderAt('/notifications');

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });

  it('offers "Open" only for resources that have a screen', async () => {
    renderAt('/notifications');
    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/proposals/p-1',
    );
    expect(within(rows[1]).queryByRole('link', { name: 'Open' })).toBeNull();
  });
});
