import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

async function fetchMessages(otherUserId: string): Promise<DirectMessage[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data, error } = await supabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`,
    )
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DirectMessage[];
}

// polling: sondear cada 5s mientras la conversación está en pantalla
// (pásese useIsFocused() desde la pantalla) — sin Realtime a propósito.
export function useDirectMessages(otherUserId: string | null, polling: boolean = true) {
  const queryClient = useQueryClient();
  const queryKey = ['directMessages', otherUserId];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchMessages(otherUserId as string),
    enabled: !!otherUserId,
    refetchInterval: polling && otherUserId ? 5000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));
      const trimmed = body.trim();
      if (!trimmed || !otherUserId) return;
      const { error } = await supabase
        .from('direct_messages')
        .insert({ sender_id: user.id, recipient_id: otherUserId, body: trimmed });
      if (error) {
        if (error.code === '42501') throw new Error(i18n.t('messages.notConnected'));
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !otherUserId) return;
      const { error } = await supabase
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', otherUserId)
        .eq('recipient_id', user.id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  // Identidad estable entre renders: si no, el useEffect de ChatScreen que
  // depende de markRead se re-ejecutaría en cada render (p. ej. cada
  // pulsación de tecla en el composer), no solo al enfocar/recibir mensajes.
  const { mutateAsync: markReadAsync } = markReadMutation;
  const markRead = useCallback(() => markReadAsync(), [markReadAsync]);

  return {
    messages: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    send: (body: string) => sendMutation.mutateAsync(body),
    sending: sendMutation.isPending,
    markRead,
  };
}
