import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getProfile, sendPasswordReset } from '../data/settingsRepo';

/** Live profile for the Settings screen (`/auth/me`, session store fallback). */
export function useProfile() {
  return useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: async () => (await getProfile()).user,
    staleTime: 60_000,
  });
}

/** Write — failures reach the form (§10.4: never fake success). */
export function usePasswordReset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => sendPasswordReset(email),
    onSuccess: () => client.invalidateQueries({ queryKey: ['settings'] }),
  });
}
