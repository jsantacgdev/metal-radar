import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type DiaryEntry = {
  id: string;
  status: 'interested' | 'going' | 'attended';
  rating: number | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  kind: 'concert' | 'festival';
  concert_id: string;
  concert: {
    id: string;
    event_date: string;
    image_url?: string | null;
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
    festival_name?: string;
  };
};

async function fetchDiary(): Promise<DiaryEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  // Conciertos en paralelo con festivales
  const [concertsRes, festivalsRes] = await Promise.all([
    supabase
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
      .order('created_at', { ascending: false }),
    supabase
      .from('user_festivals')
      .select(
        `
        id, festival_id, status, created_at,
        festival:festivals!inner (
          id, name, start_date, image_url,
          venue:venues!inner ( name, city, country, lat, lng ),
          festival_bands ( band:bands ( id, name, image_url ) )
        )
      `,
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (concertsRes.error) throw concertsRes.error;
  if (festivalsRes.error) throw festivalsRes.error;

  const concertEntries: DiaryEntry[] = (concertsRes.data ?? []).map((row: any) => ({
    id: row.id,
    concert_id: row.concert_id,
    status: row.status,
    rating: row.rating,
    notes: row.notes,
    photo_url: row.photo_url,
    created_at: row.created_at,
    kind: 'concert',
    concert: {
      id: row.concert.id,
      event_date: row.concert.event_date,
      venue: row.concert.venue,
      bands: row.concert.concert_bands.map((cb: any) => cb.band),
    },
  }));

  const festivalEntries: DiaryEntry[] = (festivalsRes.data ?? []).map((row: any) => ({
    id: row.id,
    concert_id: row.festival_id, // reutilizamos el campo para navegación
    status: row.status,
    rating: null,
    notes: null,
    photo_url: null,
    created_at: row.created_at,
    kind: 'festival',
    concert: {
      id: row.festival.id,
      // Los festivales tienen start_date como DATE puro, lo normalizamos a ISO
      event_date: `${row.festival.start_date}T00:00:00`,
      venue: row.festival.venue,
      bands: (row.festival.festival_bands ?? []).map((fb: any) => fb.band),
      festival_name: row.festival.name,
      image_url: row.festival.image_url,
    },
  }));

  // Combinar y ordenar por fecha del evento descendente (más recientes primero)
  return [...concertEntries, ...festivalEntries].sort(
    (a, b) => new Date(b.concert.event_date).getTime() - new Date(a.concert.event_date).getTime(),
  );
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
