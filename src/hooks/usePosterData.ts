import { useMemo } from 'react';
import { useProfileStats } from './useProfileStats';

export type PosterBand = {
  id: string;
  name: string;
  count: number;
  popularity: number | null;
  listeners: number | null;
};

export type PosterData = {
  year: number;
  totalShows: number;
  totalBands: number;
  headliners: PosterBand[];
  specialGuests: PosterBand[];
  featuredActs: PosterBand[];
  alsoPerforming: PosterBand[];
  hasEnoughData: boolean;
};

export function usePosterData(year: number): { data: PosterData; loading: boolean } {
  const { stats, entries, loading } = useProfileStats('year', year);

  const data = useMemo<PosterData>(() => {
    const bandMap = new Map<string, PosterBand>();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        const ex = bandMap.get(b.id);
        if (ex) ex.count++;
        else
          bandMap.set(b.id, {
            id: b.id,
            name: b.name,
            count: 1,
            popularity: b.popularity ?? null,
            listeners: b.listeners ?? null,
          });
      });
    });

    const sorted = Array.from(bandMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;

      const lisA = a.listeners ?? -1;
      const lisB = b.listeners ?? -1;
      if (lisB !== lisA) return lisB - lisA;

      const popA = a.popularity ?? -1;
      const popB = b.popularity ?? -1;
      if (popB !== popA) return popB - popA;

      return a.name.localeCompare(b.name);
    });

    const headliners = sorted.slice(0, 4);
    const specialGuests = sorted.slice(4, 12);
    const featuredActs = sorted.slice(12, 28);
    const alsoPerforming = sorted.slice(28, 60);

    return {
      year,
      totalShows: stats.concerts + stats.festivals,
      totalBands: stats.bands,
      headliners,
      specialGuests,
      featuredActs,
      alsoPerforming,
      hasEnoughData: sorted.length >= 4,
    };
  }, [stats, entries, year]);

  return { data, loading };
}
