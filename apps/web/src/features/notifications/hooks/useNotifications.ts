import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listNotifications, markAllRead, markRead } from '../data/notificationsRepo';
import type { ListNotificationsArgs } from '../data/types';

/**
 * §10.4 — TanStack is the fetching mechanism; `useEffect` fetching is
 * REJECTED. The `['notifications']` root is the invalidation point the
 * topbar bell's `['notifications','unreadCount']` query (shell) hangs off,
 * so marking anything read refreshes the badge too.
 */
export function useNotifications(args: ListNotificationsArgs) {
  return useQuery({
    queryKey: ['notifications', 'list', args.page, args.limit, args.unreadOnly],
    queryFn: () => listNotifications(args),
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markRead(id),
    onSettled: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => markAllRead(),
    onSettled: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
