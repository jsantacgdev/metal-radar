import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';

export type RecommendedBand = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

export function useRecommendations() {
  const [recommendations, setRecommendations] =
    useState<RecommendedBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<
    string | null
  >(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/recommend-bands`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        },
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRecommendations(
        json.recommendations ?? [],
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    recommendations,
    loading,
    error,
    reload: load,
  };
}
