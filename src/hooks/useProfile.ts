import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Profile = {
  id: string;
  display_name: string | null;
  home_lat: number | null;
  home_lng: number | null;
  search_radius_km: number;
  push_token: string | null;
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      setProfile(data as Profile);
    } finally {
      setLoading(false);
    }
  }, []);

  const update = async (patch: Partial<Profile>) => {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    if (error) throw error;
    setProfile({ ...profile, ...patch });
  };

  useEffect(() => {
    load();
  }, [load]);

  return { profile, loading, update, reload: load };
}
