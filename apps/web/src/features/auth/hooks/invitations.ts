import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, type InvitationPreview } from '@/lib/api/http';

/**
 * Read-only invitation preview (plan 4.6): the API answers HTTP 200 with a
 * status discriminator, so routing happens in the component — never by
 * status code. `staleTime: 0` because activation flips the status.
 */
export function useInvitation(token: string | null): UseQueryResult<InvitationPreview> {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () => {
      if (!token) throw new Error('missing token');
      return api.get<InvitationPreview>(`/auth/invitation/${encodeURIComponent(token)}`);
    },
    enabled: !!token,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
