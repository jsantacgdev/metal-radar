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
  bands: { id: string; name: string; image_url: string | null; is_headliner: boolean }[];
  distance_km: number;
  is_festival: boolean;
  festival_name?: string;
  user_status: 'interested' | 'going' | 'attended' | null;
};

// 'mine': conciertos y festivales de las bandas que sigues (en cualquier sitio).
// 'all': además, todo lo que haya en tu radio, sigas o no a la banda (p. ej. lo
// que trae sync-ticketmaster-europe).
export type ConcertScope = 'mine' | 'all';

// .in('id', ids) va en la URL: con cientos de ids se pasa del límite, así que
// se consulta en bloques.
const IN_CHUNK = 100;

async function selectInChunks(
  ids: string[],
  query: (chunk: string[]) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await query(ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

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

async function fetchNearbyConcerts(
  userLat: number,
  userLng: number,
  scope: ConcertScope,
  radiusKm: number,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const nowIso = new Date().toISOString();
  const today = nowIso.split('T')[0];

  const { data: followedConcertRows, error: fcError } = await supabase
    .from('concerts')
    .select('id, concert_bands!inner ( band:bands!inner ( user_bands!inner ( user_id ) ) )')
    .gte('event_date', nowIso)
    .eq('concert_bands.band.user_bands.user_id', user.id);

  if (fcError) throw fcError;
  const concertIds = new Set((followedConcertRows ?? []).map((c: any) => c.id as string));

  const { data: followedFestivalRows, error: ffError } = await supabase
    .from('festivals')
    .select('id, festival_bands!inner ( band:bands!inner ( user_bands!inner ( user_id ) ) )')
    .gte('end_date', today)
    .eq('festival_bands.band.user_bands.user_id', user.id);

  if (ffError) throw ffError;
  const festivalIds = new Set((followedFestivalRows ?? []).map((f: any) => f.id as string));

  if (scope === 'all') {
    // Todo lo que hay en el rectángulo que contiene tu radio (el filtro exacto
    // por distancia se hace abajo con haversine).
    const box = boundingBox(userLat, userLng, radiusKm);
    const [{ data: areaConcerts, error: acError }, { data: areaFestivals, error: afError }] =
      await Promise.all([
        supabase
          .from('concerts')
          .select('id, venue:venues!inner ( lat, lng )')
          .gte('event_date', nowIso)
          .lt('report_count', 2)
          .gte('venue.lat', box.minLat)
          .lte('venue.lat', box.maxLat)
          .gte('venue.lng', box.minLng)
          .lte('venue.lng', box.maxLng)
          .limit(1000),
        supabase
          .from('festivals')
          .select('id, venue:venues!inner ( lat, lng )')
          .gte('end_date', today)
          .gte('venue.lat', box.minLat)
          .lte('venue.lat', box.maxLat)
          .gte('venue.lng', box.minLng)
          .lte('venue.lng', box.maxLng)
          .limit(200),
      ]);
    if (acError) throw acError;
    if (afError) throw afError;
    (areaConcerts ?? []).forEach((c: any) => concertIds.add(c.id));
    (areaFestivals ?? []).forEach((f: any) => festivalIds.add(f.id));
  }

  if (concertIds.size === 0 && festivalIds.size === 0) return [];

  const concertsData = await selectInChunks([...concertIds], (chunk) =>
    supabase
      .from('concerts')
      .select(
        `
      id, event_date, ticket_url, price_min, price_max, currency, report_count,
      venue:venues!inner ( id, name, city, country, lat, lng ),
      concert_bands ( is_headliner, band:bands ( id, name, image_url ) )
    `,
      )
      .in('id', chunk)
      .lt('report_count', 2),
  );

  const festivalsData = await selectInChunks([...festivalIds], (chunk) =>
    supabase
      .from('festivals')
      .select(
        `
      id, name, description, start_date, end_date, ticket_url,
      venue:venues!inner ( id, name, city, country, lat, lng ),
      festival_bands ( is_headliner, band:bands ( id, name, image_url ) )
    `,
      )
      .in('id', chunk),
  );

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

  const sortBands = (
    bands: { id: string; name: string; image_url: string | null; is_headliner: boolean }[],
  ) => [...bands].sort((a, b) => Number(b.is_headliner) - Number(a.is_headliner));

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
      bands: sortBands(
        (c.concert_bands ?? []).map((cb: any) => ({
          id: cb.band.id,
          name: cb.band.name,
          image_url: cb.band.image_url,
          is_headliner: !!cb.is_headliner,
        })),
      ),
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
      bands: sortBands(
        (f.festival_bands ?? []).map((fb: any) => ({
          id: fb.band.id,
          name: fb.band.name,
          image_url: fb.band.image_url,
          is_headliner: !!fb.is_headliner,
        })),
      ),
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
  scope: ConcertScope = 'mine',
) {
  const enabled = userLat != null && userLng != null;

  const query = useQuery({
    // El radio solo cambia la consulta en modo 'all'.
    queryKey: ['nearbyConcerts', userLat, userLng, scope, scope === 'all' ? radiusKm : null],
    queryFn: () => fetchNearbyConcerts(userLat!, userLng!, scope, radiusKm),
    enabled,
  });

  const all = query.data ?? [];
  const concerts = all.filter((c) => c.distance_km <= radiusKm);
  const farConcerts = all.filter((c) => c.distance_km > radiusKm);

  return {
    concerts,
    farConcerts,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
  };
}
