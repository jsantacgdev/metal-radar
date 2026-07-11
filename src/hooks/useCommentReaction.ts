import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

type ReactionState = { count: number; reacted: boolean };

async function fetchReactionState(commentId: string): Promise<ReactionState> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error, count } = await supabase
    .from('reactions')
    .select('user_id', { count: 'exact' })
    .eq('comment_id', commentId);
  if (error) throw error;

  return {
    count: count ?? 0,
    reacted: !!user && (data ?? []).some((r: any) => r.user_id === user.id),
  };
}

export function useCommentReaction(commentId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['commentReaction', commentId];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchReactionState(commentId),
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      const current = queryClient.getQueryData<ReactionState>(queryKey);
      if (current?.reacted) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('user_id', user.id)
          .eq('comment_id', commentId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reactions').insert({ user_id: user.id, comment_id: commentId });
        if (error) throw error;
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ReactionState>(queryKey);
      if (prev) {
        queryClient.setQueryData<ReactionState>(queryKey, {
          count: prev.reacted ? prev.count - 1 : prev.count + 1,
          reacted: !prev.reacted,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    count: query.data?.count ?? 0,
    reacted: query.data?.reacted ?? false,
    loading: query.isLoading,
    toggle: () => toggleMutation.mutateAsync(),
  };
}
