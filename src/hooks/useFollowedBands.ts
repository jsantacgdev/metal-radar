import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type FollowedBand = {
  id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

export function useFollowedBands() {
  const [bands, setBands] = useState<FollowedBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
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

      const mapped: FollowedBand[] = (data ?? []).map((row: any) => row.band).filter(Boolean);
      setBands(mapped);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const unfollow = async (bandId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_bands').delete().eq('user_id', user.id).eq('band_id', bandId);
    setBands((prev) => prev.filter((b) => b.id !== bandId));
  };

  useEffect(() => {
    load();
  }, [load]);

  return { bands, loading, error, reload: load, unfollow };
}
