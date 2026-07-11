import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type WhoIsGoingTargetType = 'concert' | 'festival';

export type WhoIsGoingEntry = {
  id: string;
  username: string | null;
  display_name: string | null;
  status: 'interested' | 'going' | 'attended';
};

// Restringido a "gente que sigo" (no a todo lo que la RLS de la Fase 2
// deje ver), así que se filtra explícitamente por followee_id en vez de
// confiar solo en lo que las políticas de user_concerts/user_festivals
// permiten leer.
async function fetchWhoIsGoing(
  targetType: WhoIsGoingTargetType,
  targetId: string,
): Promise<WhoIsGoingEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data: follows, error: followsErr } = await supabase
    .from('user_follows')
    .select('followee_id')
    .eq('follower_id', user.id)
    .eq('status', 'accepted');
  if (followsErr) throw followsErr;

  const followedIds = (follows ?? []).map((f) => f.followee_id);
  if (followedIds.length === 0) return [];

  const table = targetType === 'concert' ? 'user_concerts' : 'user_festivals';
  const column = targetType === 'concert' ? 'concert_id' : 'festival_id';

  const { data: rows, error: rowsErr } = await supabase
    .from(table)
    .select('user_id, status')
    .eq(column, targetId)
    .in('user_id', followedIds)
    .in('status', ['interested', 'going', 'attended']);
  if (rowsErr) throw rowsErr;
  if (!rows || rows.length === 0) return [];

  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in(
      'id',
      rows.map((r: any) => r.user_id),
    );
  if (profilesErr) throw profilesErr;

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return (rows as any[])
    .map((r) => {
      const profile = profileMap.get(r.user_id);
      if (!profile) return null;
      return {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        status: r.status,
      };
    })
    .filter((entry): entry is WhoIsGoingEntry => entry !== null);
}

export function useWhoIsGoing(targetType: WhoIsGoingTargetType, targetId: string | null) {
  const query = useQuery({
    queryKey: ['whoIsGoing', targetType, targetId],
    queryFn: () => fetchWhoIsGoing(targetType, targetId as string),
    enabled: !!targetId,
  });

  return {
    users: query.data ?? [],
    loading: query.isLoading,
  };
}
