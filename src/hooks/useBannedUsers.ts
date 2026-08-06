import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type BannedUser = {
  id: string;
  username: string | null;
  display_name: string | null;
  banned_until: string;
};

async function fetchBannedUsers(): Promise<BannedUser[]> {
  // La política de profiles ya es de lectura abierta, no hace falta RLS nueva.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, banned_until')
    .not('banned_until', 'is', null)
    .order('banned_until', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BannedUser[];
}

export function useBannedUsers() {
  const query = useQuery({ queryKey: ['bannedUsers'], queryFn: fetchBannedUsers });
  return {
    users: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
