import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type Connection = { id: string; username: string | null; display_name: string | null };

// "Conectado" = misma regla que are_connected() en SQL (RLS de
// direct_messages): sigues a la otra persona, o ella te sigue a ti,
// con status aceptado en cualquiera de los dos sentidos.
async function fetchConnections(): Promise<Connection[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const [{ data: following, error: followingErr }, { data: followers, error: followersErr }] = await Promise.all([
    supabase
      .from('user_follows')
      .select('profile:profiles!user_follows_followee_id_fkey(id, username, display_name)')
      .eq('follower_id', user.id)
      .eq('status', 'accepted'),
    supabase
      .from('user_follows')
      .select('profile:profiles!user_follows_follower_id_fkey(id, username, display_name)')
      .eq('followee_id', user.id)
      .eq('status', 'accepted'),
  ]);
  if (followingErr) throw followingErr;
  if (followersErr) throw followersErr;

  const map = new Map<string, Connection>();
  for (const row of [...((following ?? []) as any[]), ...((followers ?? []) as any[])]) {
    if (row.profile) map.set(row.profile.id, row.profile);
  }
  return Array.from(map.values()).sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''));
}

export function useConnections() {
  const query = useQuery({ queryKey: ['connections'], queryFn: fetchConnections });
  return {
    connections: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
