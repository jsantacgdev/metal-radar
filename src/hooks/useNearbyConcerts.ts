import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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
  bands: {
    id: string;
    name: string;
    image_url: string | null;
  }[];
  distance_km: number;
};

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) =>
    (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchNearbyConcerts(
  userLat: number,
  userLng: number,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sin sesión');

  const { data, error } = await supabase
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
    .eq(
      'concert_bands.band.user_bands.user_id',
      user.id,
    )
    .order('event_date', { ascending: true });

  if (error) throw error;

  const flat: ConcertWithDetails[] = (data ?? [])
    .filter(
      (c: any) => c.venue?.lat && c.venue?.lng,
    )
    .map((c: any) => ({
      id: c.id,
      event_date: c.event_date,
      ticket_url: c.ticket_url,
      price_min: c.price_min,
      price_max: c.price_max,
      currency: c.currency,
      venue: c.venue,
      bands: c.concert_bands.map(
        (cb: any) => cb.band,
      ),
      distance_km: haversine(
        userLat,
        userLng,
        c.venue.lat,
        c.venue.lng,
      ),
    }));

  const dedup = new Map<
    string,
    ConcertWithDetails
  >();
  for (const c of flat) {
    if (!dedup.has(c.id)) dedup.set(c.id, c);
    else {
      const existing = dedup.get(c.id)!;
      for (const b of c.bands) {
        if (
          !existing.bands.find(
            (x) => x.id === b.id,
          )
        )
          existing.bands.push(b);
      }
    }
  }
  return Array.from(dedup.values());
}

export function useNearbyConcerts(
  userLat: number | null,
  userLng: number | null,
  radiusKm: number,
) {
  const enabled =
    userLat != null && userLng != null;

  const query = useQuery({
    queryKey: [
      'nearbyConcerts',
      userLat,
      userLng,
    ],
    queryFn: () =>
      fetchNearbyConcerts(userLat!, userLng!),
    enabled,
  });

  const all = query.data ?? [];
  const concerts = all.filter(
    (c) => c.distance_km <= radiusKm,
  );
  const farConcerts = all.filter(
    (c) => c.distance_km > radiusKm,
  );

  return {
    concerts,
    farConcerts,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
