import { useQuery } from '@tanstack/react-query';

import { getStudentDashboard } from '../data/studentDashboardRepo';

/** §16.2 dashboard read — TanStack is the fetching mechanism (§10.4). */
export function useStudentDashboard(userId: string | undefined) {
  return useQuery({
    queryKey: ['studentDashboard', userId],
    queryFn: async () => {
      if (!userId) throw new Error('missing user id');
      return getStudentDashboard(userId);
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
