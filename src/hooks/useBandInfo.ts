import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type BandMember = {
  name: string;
  begin?: string;
  end?: string;
  current: boolean;
};

export type BandInfo = {
  name: string;
  bio: string | null;
  formed_year: number | null;
  country: string | null;
  members: BandMember[];
  genres: string[];
};

async function fetchBandInfo(bandId: string): Promise<BandInfo> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/band-info`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ band_id: bandId }),
  });
  const json = await res.json();
  console.log('band-info response:', JSON.stringify(json, null, 2));
  if (json.error) throw new Error(json.error);
  return json;
}

export function useBandInfo(bandId: string) {
  const query = useQuery({
    queryKey: ['bandInfo', bandId],
    queryFn: () => fetchBandInfo(bandId),
    staleTime: 30 * 60 * 1000, // 30 min en cliente
  });

  return {
    info: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
