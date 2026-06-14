import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type FollowedBand = {
  id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

async function fetchFollowedBands(): Promise<FollowedBand[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sin sesión');

  const { data, error } = await supabase
    .from('user_bands')
    .select('band:bands ( id, name, image_url, genres )')
    .eq('user_id', user.id)
    .order('followed_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => row.band).filter(Boolean);
}

export function useFollowedBands() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['followedBands'],
    queryFn: fetchFollowedBands,
  });

  const unfollowMutation = useMutation({
    mutationFn: async (bandId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));
      const { error } = await supabase
        .from('user_bands')
        .delete()
        .eq('user_id', user.id)
        .eq('band_id', bandId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['followedBands'],
      });
      queryClient.invalidateQueries({
        queryKey: ['recommendations'],
      });
    },
  });

  return {
    bands: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
    unfollow: (bandId: string) => unfollowMutation.mutateAsync(bandId),
  };
}
