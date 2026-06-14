import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type FestivalDetail = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  ticket_url: string | null;
  official_url: string | null;
  image_url: string | null;
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
    is_headliner: boolean;
    is_followed: boolean;
  }[];
  followed_count: number;
};

async function fetchFestival(festivalId: string): Promise<FestivalDetail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data, error } = await supabase
    .from('festivals')
    .select(
      `
      id, name, description, start_date, end_date, ticket_url, official_url, image_url,
      venue:venues!inner ( id, name, city, country, lat, lng ),
      festival_bands (
        is_headliner,
        band:bands ( id, name, image_url )
      )
    `,
    )
    .eq('id', festivalId)
    .single();

  if (error) throw error;

  // Cargar bandas seguidas por el user para marcarlas
  const { data: userBands } = await supabase
    .from('user_bands')
    .select('band_id')
    .eq('user_id', user.id);

  const followedIds = new Set((userBands ?? []).map((ub: any) => ub.band_id));

  const f: any = data;
  const bands = (f.festival_bands ?? [])
    .map((fb: any) => ({
      id: fb.band.id,
      name: fb.band.name,
      image_url: fb.band.image_url,
      is_headliner: fb.is_headliner ?? false,
      is_followed: followedIds.has(fb.band.id),
    }))
    .sort((a: any, b: any) => {
      // Seguidas primero, luego headliners, luego por nombre
      if (a.is_followed !== b.is_followed) return a.is_followed ? -1 : 1;
      if (a.is_headliner !== b.is_headliner) return a.is_headliner ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    id: f.id,
    name: f.name,
    description: f.description,
    start_date: f.start_date,
    end_date: f.end_date,
    ticket_url: f.ticket_url,
    official_url: f.official_url,
    image_url: f.image_url,
    venue: f.venue,
    bands,
    followed_count: bands.filter((b: any) => b.is_followed).length,
  };
}

export function useFestival(festivalId: string) {
  const query = useQuery({
    queryKey: ['festival', festivalId],
    queryFn: () => fetchFestival(festivalId),
    enabled: !!festivalId,
  });

  return {
    festival: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
