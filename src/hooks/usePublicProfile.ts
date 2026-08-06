import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_private: boolean;
};

export type FollowState = 'self' | 'none' | 'pending' | 'accepted';

export type PublicProfileData = {
  profile: PublicProfile;
  followState: FollowState;
  followsMe: boolean;
};

async function fetchPublicProfile(userId: string): Promise<PublicProfileData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_private')
    .eq('id', userId)
    .single();
  if (error) throw error;

  if (user.id === userId) {
    return { profile, followState: 'self', followsMe: false };
  }

  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    supabase
      .from('user_follows')
      .select('status')
      .eq('follower_id', user.id)
      .eq('followee_id', userId)
      .maybeSingle(),
    supabase
      .from('user_follows')
      .select('status')
      .eq('follower_id', userId)
      .eq('followee_id', user.id)
      .maybeSingle(),
  ]);

  return {
    profile,
    followState: (outgoing?.status as FollowState | undefined) ?? 'none',
    followsMe: incoming?.status === 'accepted',
  };
}

export function usePublicProfile(userId: string | null) {
  const query = useQuery({
    queryKey: ['publicProfile', userId],
    queryFn: () => fetchPublicProfile(userId as string),
    enabled: !!userId,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}

export type FollowCounts = { followers: number; following: number };

async function fetchFollowCounts(userId: string): Promise<FollowCounts> {
  const [followers, following] = await Promise.all([
    supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('followee_id', userId)
      .eq('status', 'accepted'),
    supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId)
      .eq('status', 'accepted'),
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

export function useFollowCounts(userId: string | null) {
  const query = useQuery({
    queryKey: ['followCounts', userId],
    queryFn: () => fetchFollowCounts(userId as string),
    enabled: !!userId,
  });

  return {
    counts: query.data ?? { followers: 0, following: 0 },
    loading: query.isLoading,
  };
}
