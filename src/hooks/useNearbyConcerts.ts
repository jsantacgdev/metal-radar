import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type ConcertWithDetails = {
  id: string;
  event_date: string;
  ticket_url: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  venue: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
    lat: number;
    lng: number;
  };
  bands: { id: string; name: string; image_url: string | null }[];
  distance_km: number;
  is_festival: boolean;
  festival_name?: string;
  user_status: 'interested' | 'going' | 'attended' | null;
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchNearbyConcerts(userLat: number, userLng: number) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data: concertsData, error: cError } = await supabase
    .from('concerts')
    .select(
      `
      id, event_date, ticket_url, price_min, price_max, currency,
      venue:venues!inner ( id, name, city, country, lat, lng ),
      concert_bands!inner (
        band:bands!inner (
          id, name, image_url,
          user_bands!inner ( user_id )
        )
      )
    `,
    )
    .gte('event_date', new Date().toISOString())
    .eq('concert_bands.band.user_bands.user_id', user.id)
    .order('event_date', { ascending: true });

  if (cError) throw cError;

  const { data: festivalsData, error: fError } = await supabase
    .from('festivals')
    .select(
      `
      id, name, description, start_date, end_date, ticket_url,
      venue:venues!inner ( id, name, city, country, lat, lng ),
      festival_bands!inner (
        band:bands!inner (
          id, name, image_url,
          user_bands!inner ( user_id )
        )
      )
    `,
    )
    .gte('end_date', new Date().toISOString().split('T')[0])
    .eq('festival_bands.band.user_bands.user_id', user.id)
    .order('start_date', { ascending: true });

  if (fError) throw fError;

  const { data: userConcertsData } = await supabase
    .from('user_concerts')
    .select('concert_id, status')
    .eq('user_id', user.id);

  const statusByConcertId = new Map<string, 'interested' | 'going' | 'attended'>();
  for (const uc of userConcertsData ?? []) {
    statusByConcertId.set(uc.concert_id, uc.status);
  }

  const { data: userFestivalsData } = await supabase
    .from('user_festivals')
    .select('festival_id, status')
    .eq('user_id', user.id);

  const statusByFestivalId = new Map<string, 'interested' | 'going' | 'attended'>();
  for (const uf of userFestivalsData ?? []) {
    statusByFestivalId.set(uf.festival_id, uf.status);
  }

  const concerts: ConcertWithDetails[] = (concertsData ?? [])
    .filter((c: any) => c.venue?.lat && c.venue?.lng)
    .map((c: any) => ({
      id: c.id,
      event_date: c.event_date,
      ticket_url: c.ticket_url,
      price_min: c.price_min,
      price_max: c.price_max,
      currency: c.currency,
      venue: c.venue,
      bands: c.concert_bands.map((cb: any) => cb.band),
      distance_km: haversine(userLat, userLng, c.venue.lat, c.venue.lng),
      is_festival: false,
      user_status: statusByConcertId.get(c.id) ?? null,
    }));

  const festivals: ConcertWithDetails[] = (festivalsData ?? [])
    .filter((f: any) => f.venue?.lat && f.venue?.lng)
    .map((f: any) => ({
      id: `fest_${f.id}`,
      event_date: `${f.start_date}T00:00:00`,
      ticket_url: f.ticket_url,
      price_min: null,
      price_max: null,
      currency: null,
      venue: f.venue,
      bands: f.festival_bands.map((fb: any) => fb.band),
      distance_km: haversine(userLat, userLng, f.venue.lat, f.venue.lng),
      is_festival: true,
      festival_name: f.name,
      user_status: statusByFestivalId.get(f.id) ?? null,
    }));

  const all = [...concerts, ...festivals];

  const dedup = new Map<string, ConcertWithDetails>();
  for (const c of all) {
    const key = `${c.venue.id}_${c.event_date.split('T')[0]}_${c.is_festival ? 'fest' : 'con'}`;
    if (!dedup.has(key)) {
      dedup.set(key, c);
    } else {
      const existing = dedup.get(key)!;
      for (const b of c.bands) {
        if (!existing.bands.find((x) => x.id === b.id)) existing.bands.push(b);
      }
    }
  }

  return Array.from(dedup.values()).sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
  );
}

export function useNearbyConcerts(
  userLat: number | null,
  userLng: number | null,
  radiusKm: number,
) {
  const enabled = userLat != null && userLng != null;

  const query = useQuery({
    queryKey: ['nearbyConcerts', userLat, userLng],
    queryFn: () => fetchNearbyConcerts(userLat!, userLng!),
    enabled,
  });

  const all = query.data ?? [];
  const concerts = all.filter((c) => c.distance_km <= radiusKm);
  const farConcerts = all.filter((c) => c.distance_km > radiusKm);

  return {
    concerts,
    farConcerts,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
