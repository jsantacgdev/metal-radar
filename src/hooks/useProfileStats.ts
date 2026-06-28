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
  topBand: { id: string; name: string; image_url: string | null; count: number } | null;
  topGenre: string | null;
  bestYear: { year: number; count: number } | null;
};

export type StatsBand = {
  id: string;
  name: string;
  image_url: string | null;
  genres: string[];
  popularity: number | null;
  listeners: number | null;
};

export type StatsEntry = {
  event_date: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  bands: StatsBand[];
  kind: 'concert' | 'festival';
  raw_id: string;
  parent_id: string;
  parent_name?: string;
  venue_name?: string;
  image_url?: string | null;
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

type RawData = {
  entries: StatsEntry[];
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
        id, concert_id,
        concert:concerts!inner (
          id, event_date,
          venue:venues!inner ( name, city, lat, lng ),
          concert_bands ( is_headliner, band:bands ( id, name, image_url, genres, spotify_popularity, lastfm_listeners ) )
        )
      `,
      )
      .eq('user_id', user.id)
      .eq('status', 'attended'),
    supabase
      .from('user_festivals')
      .select(
        `
        id, festival_id,
        festival:festivals!inner (
          id, name, start_date, image_url,
          venue:venues!inner ( name, city, lat, lng ),
          festival_bands ( is_headliner, band:bands ( id, name, image_url, genres, spotify_popularity, lastfm_listeners ) )
        )
      `,
      )
      .eq('user_id', user.id)
      .eq('status', 'attended'),
    supabase.from('profiles').select('home_lat, home_lng').eq('id', user.id).maybeSingle(),
  ]);

  if (concertsRes.error) throw concertsRes.error;
  if (festivalsRes.error) throw festivalsRes.error;

  const concertEntries: StatsEntry[] = (concertsRes.data ?? []).map((row: any) => {
    const sortedBands = (row.concert.concert_bands ?? [])
      .sort((a: any, b: any) => Number(b.is_headliner) - Number(a.is_headliner))
      .map((cb: any) => ({
        id: cb.band.id,
        name: cb.band.name,
        image_url: cb.band.image_url,
        genres: cb.band.genres ?? [],
        popularity: cb.band.spotify_popularity ?? null,
        listeners: cb.band.lastfm_listeners ?? null,
      }));

    return {
      event_date: row.concert.event_date,
      city: row.concert.venue.city,
      lat: row.concert.venue.lat,
      lng: row.concert.venue.lng,
      bands: sortedBands,
      kind: 'concert' as const,
      raw_id: row.id,
      parent_id: row.concert_id,
      venue_name: row.concert.venue.name,
      image_url: sortedBands[0]?.image_url ?? null,
    };
  });

  const festivalEntries: StatsEntry[] = (festivalsRes.data ?? []).map((row: any) => ({
    event_date: `${row.festival.start_date}T00:00:00`,
    city: row.festival.venue.city,
    lat: row.festival.venue.lat,
    lng: row.festival.venue.lng,
    bands: (row.festival.festival_bands ?? [])
      .sort((a: any, b: any) => Number(b.is_headliner) - Number(a.is_headliner))
      .map((fb: any) => ({
        id: fb.band.id,
        name: fb.band.name,
        image_url: fb.band.image_url,
        genres: fb.band.genres ?? [],
        popularity: fb.band.spotify_popularity ?? null,
        listeners: fb.band.lastfm_listeners ?? null,
      })),
    kind: 'festival',
    raw_id: row.id,
    parent_id: row.festival_id,
    parent_name: row.festival.name,
    venue_name: row.festival.venue.name,
    image_url: row.festival.image_url,
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
): {
  stats: ProfileStats;
  entries: StatsEntry[];
  homeLat: number | null;
  homeLng: number | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ['profileStats'],
    queryFn: async () => {
      try {
        const data = await fetchRawData();
        return data;
      } catch (err) {
        throw err;
      }
    },
    staleTime: 60_000,
  });

  const { stats, filteredEntries } = useMemo(() => {
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

    if (!query.data) return { stats: empty, filteredEntries: [] };

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

    const cities = new Set(entries.map((e) => e.city).filter((c): c is string => !!c));

    const bandFreq = new Map<
      string,
      { id: string; name: string; image_url: string | null; count: number }
    >();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        const existing = bandFreq.get(b.id);
        if (existing) existing.count++;
        else
          bandFreq.set(b.id, {
            id: b.id,
            name: b.name,
            image_url: b.image_url,
            count: 1,
          });
      });
    });

    let topBand: ProfileStats['topBand'] = null;
    bandFreq.forEach((b) => {
      if (!topBand || b.count > topBand.count) topBand = b;
    });

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

    let km = 0;
    if (query.data.homeLat != null && query.data.homeLng != null) {
      entries.forEach((e) => {
        if (e.lat != null && e.lng != null) {
          km += haversineKm(query.data!.homeLat!, query.data!.homeLng!, e.lat, e.lng);
        }
      });
    }

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
      stats: {
        concerts: concertEntries.length,
        festivals: festivalEntries.length,
        bands: bandFreq.size,
        cities: cities.size,
        km: Math.round(km),
        topBand,
        topGenre,
        bestYear,
      },
      filteredEntries: entries,
    };
  }, [query.data, period, year]);

  return {
    stats,
    entries: filteredEntries,
    homeLat: query.data?.homeLat ?? null,
    homeLng: query.data?.homeLng ?? null,
    loading: query.isLoading,
  };
}
