import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type RecommendedBand = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
  affinity: number;
};

async function fetchRecommendations(): Promise<RecommendedBand[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/recommend-bands`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  const json = await res.json();
  console.log('recommendations response:', JSON.stringify(json, null, 2));
  if (json.error) throw new Error(json.error);
  return json.recommendations ?? [];
}

export function useRecommendations() {
  const query = useQuery({
    queryKey: ['recommendations'],
    queryFn: fetchRecommendations,
    staleTime: 10 * 60 * 1000,
  });

  return {
    recommendations: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
