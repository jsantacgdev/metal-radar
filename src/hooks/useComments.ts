import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type CommentTargetType = 'concert' | 'festival';

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
  author: { id: string; username: string | null; display_name: string | null };
};

function targetColumn(targetType: CommentTargetType) {
  return targetType === 'concert' ? 'concert_id' : 'festival_id';
}

async function fetchComments(targetType: CommentTargetType, targetId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(
      'id, body, created_at, parent_comment_id, author:profiles!comments_author_id_fkey ( id, username, display_name )',
    )
    .eq(targetColumn(targetType), targetId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export function useComments(targetType: CommentTargetType, targetId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ['comments', targetType, targetId];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchComments(targetType, targetId as string),
    enabled: !!targetId,
  });

  const postMutation = useMutation({
    mutationFn: async ({ body, parentCommentId }: { body: string; parentCommentId?: string | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));
      const trimmed = body.trim();
      if (!trimmed) return;
      const { error } = await supabase.from('comments').insert({
        author_id: user.id,
        body: trimmed,
        parent_comment_id: parentCommentId ?? null,
        [targetColumn(targetType)]: targetId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    comments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    post: (body: string, parentCommentId?: string | null) =>
      postMutation.mutateAsync({ body, parentCommentId }),
    posting: postMutation.isPending,
    remove: (commentId: string) => deleteMutation.mutateAsync(commentId),
  };
}
