import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type ProfileStats = {
  concerts: number;
  festivals: number;
  bands: number;
  cities: number;
  km: number;
  topBand: { name: string; count: number } | null;
  topGenre: string | null;
  bestYear: { year: number; count: number } | null;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type Entry = {
  event_date: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  bands: { id: string; name: string; genres: string[] }[];
  kind: 'concert' | 'festival';
};

type RawData = {
  entries: Entry[];
  homeLat: number | null;
  homeLng: number | null;
};

async function fetchRawData(): Promise<RawData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const [concertsRes, festivalsRes, profileRes] = await Promise.all([
    supabase
      .from('user_concerts')
      .select(
        `
        concert:concerts!inner (
          event_date,
          venue:venues!inner ( city, lat, lng ),
          concert_bands ( band:bands ( id, name, genres ) )
        )
      `,
      )
      .eq('user_id', user.id)
      .eq('status', 'attended'),
    supabase
      .from('user_festivals')
      .select(
        `
        festival:festivals!inner (
          start_date,
          venue:venues!inner ( city, lat, lng ),
          festival_bands ( band:bands ( id, name, genres ) )
        )
      `,
      )
      .eq('user_id', user.id)
      .eq('status', 'attended'),
    supabase.from('profiles').select('home_lat, home_lng').eq('id', user.id).maybeSingle(),
  ]);

  if (concertsRes.error) throw concertsRes.error;
  if (festivalsRes.error) throw festivalsRes.error;

  const concertEntries: Entry[] = (concertsRes.data ?? []).map((row: any) => ({
    event_date: row.concert.event_date,
    city: row.concert.venue.city,
    lat: row.concert.venue.lat,
    lng: row.concert.venue.lng,
    bands: (row.concert.concert_bands ?? []).map((cb: any) => ({
      id: cb.band.id,
      name: cb.band.name,
      genres: cb.band.genres ?? [],
    })),
    kind: 'concert',
  }));

  const festivalEntries: Entry[] = (festivalsRes.data ?? []).map((row: any) => ({
    event_date: `${row.festival.start_date}T00:00:00`,
    city: row.festival.venue.city,
    lat: row.festival.venue.lat,
    lng: row.festival.venue.lng,
    bands: (row.festival.festival_bands ?? []).map((fb: any) => ({
      id: fb.band.id,
      name: fb.band.name,
      genres: fb.band.genres ?? [],
    })),
    kind: 'festival',
  }));

  return {
    entries: [...concertEntries, ...festivalEntries],
    homeLat: profileRes.data?.home_lat ?? null,
    homeLng: profileRes.data?.home_lng ?? null,
  };
}

export type StatsPeriod = 'year' | 'all';

export function useProfileStats(
  period: StatsPeriod,
  year: number,
): { stats: ProfileStats; loading: boolean } {
  const query = useQuery({
    queryKey: ['profileStats'],
    queryFn: fetchRawData,
    staleTime: 60_000,
  });

  const stats = useMemo<ProfileStats>(() => {
    const empty: ProfileStats = {
      concerts: 0,
      festivals: 0,
      bands: 0,
      cities: 0,
      km: 0,
      topBand: null,
      topGenre: null,
      bestYear: null,
    };

    if (!query.data) return empty;

    // Filtrar por periodo
    let entries = query.data.entries;
    if (period === 'year') {
      const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
      const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
      entries = entries.filter((e) => {
        const t = new Date(e.event_date).getTime();
        return t >= yearStart && t < yearEnd;
      });
    }

    const concertEntries = entries.filter((e) => e.kind === 'concert');
    const festivalEntries = entries.filter((e) => e.kind === 'festival');

    // Ciudades únicas (conciertos + festivales)
    const cities = new Set(entries.map((e) => e.city).filter((c): c is string => !!c));

    // Bandas únicas + frecuencia (conciertos + festivales)
    const bandFreq = new Map<string, { name: string; count: number }>();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        const existing = bandFreq.get(b.id);
        if (existing) existing.count++;
        else bandFreq.set(b.id, { name: b.name, count: 1 });
      });
    });

    let topBand: { name: string; count: number } | null = null;
    bandFreq.forEach((b) => {
      if (!topBand || b.count > topBand.count) topBand = b;
    });

    // Géneros (sumando todas las apariciones)
    const genreFreq = new Map<string, number>();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        b.genres.forEach((g) => {
          genreFreq.set(g, (genreFreq.get(g) ?? 0) + 1);
        });
      });
    });
    let topGenre: string | null = null;
    let topGenreCount = 0;
    genreFreq.forEach((count, genre) => {
      if (count > topGenreCount) {
        topGenre = genre;
        topGenreCount = count;
      }
    });

    // Km recorridos (suma de conciertos + festivales)
    let km = 0;
    if (query.data.homeLat != null && query.data.homeLng != null) {
      entries.forEach((e) => {
        if (e.lat != null && e.lng != null) {
          km += haversineKm(query.data!.homeLat!, query.data!.homeLng!, e.lat, e.lng);
        }
      });
    }

    // Mejor año (solo en modo all)
    let bestYear: { year: number; count: number } | null = null;
    if (period === 'all') {
      const yearFreq = new Map<number, number>();
      query.data.entries.forEach((e) => {
        const y = new Date(e.event_date).getFullYear();
        yearFreq.set(y, (yearFreq.get(y) ?? 0) + 1);
      });
      yearFreq.forEach((count, y) => {
        if (!bestYear || count > bestYear.count) bestYear = { year: y, count };
      });
    }

    return {
      concerts: concertEntries.length,
      festivals: festivalEntries.length,
      bands: bandFreq.size,
      cities: cities.size,
      km: Math.round(km),
      topBand,
      topGenre,
      bestYear,
    };
  }, [query.data, period, year]);

  return {
    stats,
    loading: query.isLoading,
  };
}
