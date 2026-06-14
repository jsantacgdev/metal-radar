import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type DiaryEntry = {
  id: string;
  concert_id: string;
  status: 'interested' | 'going' | 'attended';
  rating: number | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  concert: {
    id: string;
    event_date: string;
    venue: {
      name: string;
      city: string | null;
      country: string | null;
      lat: number | null;
      lng: number | null;
    };
    bands: {
      id: string;
      name: string;
      image_url: string | null;
    }[];
  };
};

async function fetchDiary(): Promise<DiaryEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data, error } = await supabase
    .from('user_concerts')
    .select(
      `
      id, concert_id, status, rating, notes, photo_url, created_at,
      concert:concerts!inner (
        id, event_date,
        venue:venues!inner ( name, city, country, lat, lng ),
        concert_bands ( band:bands ( id, name, image_url ) )
      )
    `,
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    concert_id: row.concert_id,
    status: row.status,
    rating: row.rating,
    notes: row.notes,
    photo_url: row.photo_url,
    created_at: row.created_at,
    concert: {
      id: row.concert.id,
      event_date: row.concert.event_date,
      venue: row.concert.venue,
      bands: row.concert.concert_bands.map((cb: any) => cb.band),
    },
  }));
}

export function useDiary() {
  const query = useQuery({
    queryKey: ['diary'],
    queryFn: fetchDiary,
  });

  return {
    entries: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
