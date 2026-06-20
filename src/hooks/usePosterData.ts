import { useMemo } from 'react';
import { useProfileStats } from './useProfileStats';

export type PosterTier = {
  bands: { id: string; name: string; count: number }[];
};

export type PosterData = {
  year: number;
  totalShows: number;
  totalBands: number;
  headliners: { id: string; name: string; count: number }[]; // Top 3
  subHeadliners: { id: string; name: string; count: number }[]; // 4-9
  mainLineup: { id: string; name: string; count: number }[]; // 10-30
  hasEnoughData: boolean;
};

export function usePosterData(year: number): { data: PosterData; loading: boolean } {
  const { stats, entries, loading } = useProfileStats('year', year);

  const data = useMemo<PosterData>(() => {
    const bandMap = new Map<string, { id: string; name: string; count: number }>();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        const ex = bandMap.get(b.id);
        if (ex) ex.count++;
        else bandMap.set(b.id, { id: b.id, name: b.name, count: 1 });
      });
    });

    const sorted = Array.from(bandMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    const headliners = sorted.slice(0, 3);
    const subHeadliners = sorted.slice(3, 9);
    const mainLineup = sorted.slice(9, 30);

    return {
      year,
      totalShows: stats.concerts + stats.festivals,
      totalBands: stats.bands,
      headliners,
      subHeadliners,
      mainLineup,
      hasEnoughData: sorted.length >= 5,
    };
  }, [stats, entries, year]);

  return { data, loading };
}
