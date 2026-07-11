import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export function useModerateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      action,
    }: {
      commentId: string;
      action: 'delete' | 'dismiss';
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error(i18n.t('errors.noSession'));

      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/moderate-comment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment_id: commentId, action }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(
          json.error === 'forbidden' ? i18n.t('errors.forbidden') : (json.error ?? i18n.t('common.error')),
        );
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportedComments'] });
    },
  });
}
