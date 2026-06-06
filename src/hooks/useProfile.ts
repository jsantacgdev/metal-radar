import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type Profile = {
  id: string;
  display_name: string | null;
  home_lat: number | null;
  home_lng: number | null;
  search_radius_km: number;
  push_token: string | null;
};

async function fetchProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data as Profile;
}

export function useProfile() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  const updateMutation = useMutation({
    mutationFn: async (
      patch: Partial<Profile>,
    ) => {
      if (!query.data)
        throw new Error('Perfil no cargado');
      const { error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', query.data.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      queryClient.setQueryData<Profile | null>(
        ['profile'],
        (old) =>
          old ? { ...old, ...patch } : old,
      );
    },
  });

  return {
    profile: query.data ?? null,
    loading: query.isLoading,
    update: (patch: Partial<Profile>) =>
      updateMutation.mutateAsync(patch),
    reload: query.refetch,
  };
}
