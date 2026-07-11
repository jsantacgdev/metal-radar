import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

function invalidateAfterBlock(queryClient: QueryClient, targetId: string) {
  queryClient.invalidateQueries({ queryKey: ['publicProfile', targetId] });
  queryClient.invalidateQueries({ queryKey: ['followCounts'] });
  queryClient.invalidateQueries({ queryKey: ['followers'] });
  queryClient.invalidateQueries({ queryKey: ['following'] });
  queryClient.invalidateQueries({ queryKey: ['followRequests'] });
  queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
}

export function useBlockUser(targetId: string) {
  const queryClient = useQueryClient();

  const blockMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      const { error: blockErr } = await supabase
        .from('blocked_users')
        .insert({ blocker_id: user.id, blocked_id: targetId });
      if (blockErr) throw blockErr;

      // Bajo RLS, el bloqueador puede borrar ambas filas de user_follows
      // (es follower en una y followee en la otra) — limpia el follow
      // existente en los dos sentidos.
      await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('followee_id', targetId);
      await supabase.from('user_follows').delete().eq('follower_id', targetId).eq('followee_id', user.id);
    },
    onSuccess: () => invalidateAfterBlock(queryClient, targetId),
  });

  const unblockMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));
      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', targetId);
      if (error) throw error;
    },
    onSuccess: () => invalidateAfterBlock(queryClient, targetId),
  });

  return {
    block: () => blockMutation.mutateAsync(),
    unblock: () => unblockMutation.mutateAsync(),
    loading: blockMutation.isPending || unblockMutation.isPending,
  };
}

export type BlockedUser = { id: string; username: string | null; display_name: string | null };

async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  // RPC en vez de un select/embed normal de `profiles`: la política de
  // profiles oculta a cualquiera con relación de bloqueo, así que un
  // embed normal no vería a la propia gente que has bloqueado.
  const { data, error } = await supabase.rpc('get_blocked_profiles');
  if (error) throw error;
  return (data ?? []) as BlockedUser[];
}

export function useBlockedUsers() {
  const query = useQuery({ queryKey: ['blockedUsers'], queryFn: fetchBlockedUsers });
  return { users: query.data ?? [], loading: query.isLoading, reload: query.refetch };
}
