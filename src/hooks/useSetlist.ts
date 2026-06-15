import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type SetlistSong = {
  name: string;
  position: number;
  encore: boolean;
  cover_of: string | null;
  is_tape: boolean;
  duration_ms: number | null;
};

export type SetlistSource = 'event' | 'tour';

export type Setlist = {
  id: string;
  concert_id: string;
  band_id: string;
  setlistfm_id: string | null;
  songs: SetlistSong[];
  total_duration_minutes: number | null;
  song_count: number;
  encore_count: number;
  not_found: boolean;
  source: SetlistSource;
  source_event_date: string | null;
  fetched_at: string;
};

async function fetchSetlists(concertId: string): Promise<Setlist[]> {
  const { data, error } = await supabase.from('setlists').select('*').eq('concert_id', concertId);
  if (error) throw error;
  return (data ?? []) as Setlist[];
}

export function useSetlists(concertId: string | null) {
  return useQuery({
    queryKey: ['setlists', concertId],
    queryFn: () => fetchSetlists(concertId!),
    enabled: !!concertId,
  });
}

export function useRefreshSetlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      concertId,
      bandId,
      force,
    }: {
      concertId: string;
      bandId?: string;
      force?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('fetch-setlist', {
        body: { concertId, bandId, force },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['setlists', vars.concertId] });
    },
  });
}
