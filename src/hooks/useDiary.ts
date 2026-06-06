import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type DiaryEntry = {
  id: string;
  concert_id: string;
  status: 'interested' | 'going' | 'attended';
  rating: number | null;
  notes: string | null;
  created_at: string;
  concert: {
    id: string;
    event_date: string;
    venue: {
      name: string;
      city: string | null;
      country: string | null;
    };
    bands: { id: string; name: string; image_url: string | null }[];
  };
};

export function useDiary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
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
        .from('user_concerts')
        .select(
          `
          id, concert_id, status, rating, notes, created_at,
          concert:concerts!inner (
            id, event_date,
            venue:venues!inner ( name, city, country ),
            concert_bands ( band:bands ( id, name, image_url ) )
          )
        `,
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: DiaryEntry[] = (data ?? []).map((row: any) => ({
        id: row.id,
        concert_id: row.concert_id,
        status: row.status,
        rating: row.rating,
        notes: row.notes,
        created_at: row.created_at,
        concert: {
          id: row.concert.id,
          event_date: row.concert.event_date,
          venue: row.concert.venue,
          bands: row.concert.concert_bands.map((cb: any) => cb.band),
        },
      }));

      setEntries(mapped);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { entries, loading, error, reload: load };
}
