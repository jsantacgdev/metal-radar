import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type Conversation = {
  otherId: string;
  username: string | null;
  displayName: string | null;
  lastBody: string;
  lastCreatedAt: string;
  unreadCount: number;
};

async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('list_conversations');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    otherId: row.other_id,
    username: row.other_username,
    displayName: row.other_display_name,
    lastBody: row.last_body,
    lastCreatedAt: row.last_created_at,
    unreadCount: row.unread_count,
  }));
}

// polling: sondear cada 15s mientras la lista está en pantalla (pásese
// useIsFocused() desde la pantalla) — sin Realtime a propósito.
export function useConversations(polling: boolean = true) {
  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    refetchInterval: polling ? 15000 : false,
  });

  return {
    conversations: query.data ?? [],
    unreadTotal: (query.data ?? []).reduce((sum, c) => sum + c.unreadCount, 0),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
