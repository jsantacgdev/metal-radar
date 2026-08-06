import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

function invalidateFollowQueries(queryClient: QueryClient, targetId: string) {
  queryClient.invalidateQueries({ queryKey: ['publicProfile', targetId] });
  queryClient.invalidateQueries({ queryKey: ['followCounts'] });
  queryClient.invalidateQueries({ queryKey: ['followers'] });
  queryClient.invalidateQueries({ queryKey: ['following'] });
  queryClient.invalidateQueries({ queryKey: ['followRequests'] });
}

export function useFollowUser(targetId: string) {
  const queryClient = useQueryClient();

  const followMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      const { data: target, error: targetErr } = await supabase
        .from('profiles')
        .select('is_private')
        .eq('id', targetId)
        .single();
      if (targetErr) throw targetErr;

      const { error } = await supabase.from('user_follows').insert({
        follower_id: user.id,
        followee_id: targetId,
        status: target.is_private ? 'pending' : 'accepted',
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateFollowQueries(queryClient, targetId),
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('followee_id', targetId);
      if (error) throw error;
    },
    onSuccess: () => invalidateFollowQueries(queryClient, targetId),
  });

  return {
    follow: () => followMutation.mutateAsync(),
    unfollow: () => unfollowMutation.mutateAsync(),
    loading: followMutation.isPending || unfollowMutation.isPending,
  };
}

export type FollowRequest = {
  follower_id: string;
  created_at: string;
  profile: { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
};

async function fetchFollowRequests(): Promise<FollowRequest[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data, error } = await supabase
    .from('user_follows')
    .select(
      'follower_id, created_at, profile:profiles!user_follows_follower_id_fkey(id, username, display_name, avatar_url)',
    )
    .eq('followee_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    follower_id: row.follower_id,
    created_at: row.created_at,
    profile: row.profile,
  }));
}

export function useFollowRequests() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['followRequests'],
    queryFn: fetchFollowRequests,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['followRequests'] });
    queryClient.invalidateQueries({ queryKey: ['followers'] });
    queryClient.invalidateQueries({ queryKey: ['followCounts'] });
  };

  const acceptMutation = useMutation({
    mutationFn: async (followerId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));
      const { error } = await supabase
        .from('user_follows')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('follower_id', followerId)
        .eq('followee_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: async (followerId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('followee_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    requests: query.data ?? [],
    loading: query.isLoading,
    reload: query.refetch,
    accept: (followerId: string) => acceptMutation.mutateAsync(followerId),
    reject: (followerId: string) => rejectMutation.mutateAsync(followerId),
  };
}

export type FollowListItem = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

async function fetchFollowers(userId: string): Promise<FollowListItem[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('profile:profiles!user_follows_follower_id_fkey(id, username, display_name, avatar_url)')
    .eq('followee_id', userId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => row.profile).filter(Boolean);
}

async function fetchFollowing(userId: string): Promise<FollowListItem[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('profile:profiles!user_follows_followee_id_fkey(id, username, display_name, avatar_url)')
    .eq('follower_id', userId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => row.profile).filter(Boolean);
}

export function useFollowList(userId: string | null, mode: 'followers' | 'following') {
  const query = useQuery({
    queryKey: [mode, userId],
    queryFn: () => (mode === 'followers' ? fetchFollowers(userId as string) : fetchFollowing(userId as string)),
    enabled: !!userId,
  });

  return {
    users: query.data ?? [],
    loading: query.isLoading,
    reload: query.refetch,
  };
}
