import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

/**
 * Shell-chrome reads (spec §10.4: TanStack Query is the fetching mechanism;
 * `useEffect` fetching is REJECTED for new code). These are the shell's own
 * two questions — not a feature screen's — so they live beside the console
 * layout rather than inside a `features/<name>/data` repository.
 *
 * Every reader is defensive (`map*`-style): a missing or malformed field
 * degrades to the empty value, never a crash.
 */

/**
 * Topbar bell badge — `GET /notifications/unread-count` (task 10.4). The
 * queryKey is the invalidation point later screens mark-read flows use
 * (`queryClient.invalidateQueries({ queryKey: ['notifications'] })`).
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: async () => {
      const payload = await api.get<{ unreadCount?: unknown }>('/notifications/unread-count');
      const value = payload?.unreadCount;
      return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Student nav state (§10.5, task 10.2): "My Project ▾" shows once the
 * student is **approved** — resolved from `GET /projects` (an active project
 * exists) plus `GET /proposals` (a proposal reached `approved`). Disabled for
 * every other role, so only a student's browser ever asks.
 */
export function useStudentNavState(enabled: boolean): boolean {
  const projects = useQuery({
    queryKey: ['shell', 'studentProjects'],
    queryFn: async () => {
      const payload = await api.get<{ projects?: unknown }>('/projects');
      return Array.isArray(payload?.projects) ? payload.projects : [];
    },
    enabled,
    staleTime: 60_000,
  });

  const proposals = useQuery({
    queryKey: ['shell', 'studentProposals'],
    queryFn: async () => {
      const payload = await api.get<{ proposals?: unknown }>('/proposals');
      return Array.isArray(payload?.proposals) ? payload.proposals : [];
    },
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return false;

  const hasProject = (projects.data ?? []).length > 0;
  const approvedProposal = (proposals.data ?? []).some(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      (entry as { status?: unknown }).status === 'approved',
  );

  return hasProject || approvedProposal;
}
