import { authClient } from '@[removed]/auth/client';

export type UserRole = 'owner' | 'admin' | 'member';

/**
 * Hook to get the current user's role in the active organization
 */
export function useUserRole() {
  const { data: member, isPending } = authClient.useActiveMember();

  return {
    role: member?.role,
    loading: isPending,
    isAdmin: member?.role === 'admin' || member?.role === 'owner',
    isOwner: member?.role === 'owner',
  };
}
