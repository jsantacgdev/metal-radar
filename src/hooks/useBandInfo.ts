import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  mb_match_quality?: 'verified' | 'unverified';
  image_url?: string | null;
  spotify_id?: string | null;
};

async function fetchBandInfo(bandId: string, lang: string): Promise<BandInfo> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/band-info`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ band_id: bandId, lang }),
  });
  const json = await res.json().catch(() => ({}));
  // Un 546 del runtime de Supabase trae { code, message } en vez de { error }:
  // sin comprobar res.ok se devolvería como si fueran los datos de la banda.
  if (!res.ok || json.error) {
    throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`);
  }
  return json;
}

export function useBandInfo(bandId: string) {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';

  const query = useQuery({
    queryKey: ['bandInfo', bandId, lang],
    queryFn: () => fetchBandInfo(bandId, lang),
    staleTime: 30 * 60 * 1000,
  });

  return {
    info: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
