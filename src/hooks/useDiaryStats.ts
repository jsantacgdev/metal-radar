import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { DiaryEntry } from './useDiary';

export type DiaryStats = {
  shows: number;
  bands: number;
  newBands: number;
  cities: number;
  km: number;
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

async function fetchHomeLocation(): Promise<{ lat: number | null; lng: number | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { lat: null, lng: null };

  const { data } = await supabase
    .from('profiles')
    .select('home_lat, home_lng')
    .eq('id', user.id)
    .maybeSingle();

  return { lat: data?.home_lat ?? null, lng: data?.home_lng ?? null };
}

export function useDiaryStats(entries: DiaryEntry[], year: number): DiaryStats {
  const { data: home } = useQuery({
    queryKey: ['profile-home'],
    queryFn: fetchHomeLocation,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();

    const attendedThisYear = entries.filter((e) => {
      if (e.status !== 'attended') return false;
      const d = new Date(e.concert.event_date).getTime();
      return d >= yearStart && d < yearEnd;
    });

    const bandIdsThisYear = new Set<string>();
    attendedThisYear.forEach((e) => e.concert.bands.forEach((b) => bandIdsThisYear.add(b.id)));

    const bandIdsBefore = new Set<string>();
    entries.forEach((e) => {
      if (e.status !== 'attended') return;
      const d = new Date(e.concert.event_date).getTime();
      if (d < yearStart) e.concert.bands.forEach((b) => bandIdsBefore.add(b.id));
    });
    const newBands = Array.from(bandIdsThisYear).filter((id) => !bandIdsBefore.has(id)).length;

    const cities = new Set(
      attendedThisYear.map((e) => e.concert.venue.city).filter((c): c is string => !!c),
    );

    let km = 0;
    if (home?.lat != null && home?.lng != null) {
      attendedThisYear.forEach((e) => {
        const { lat, lng } = e.concert.venue;
        if (lat != null && lng != null) {
          km += haversineKm(home.lat!, home.lng!, lat, lng);
        }
      });
    }

    return {
      shows: attendedThisYear.length,
      bands: bandIdsThisYear.size,
      newBands,
      cities: cities.size,
      km: Math.round(km),
    };
  }, [entries, year, home]);
}
