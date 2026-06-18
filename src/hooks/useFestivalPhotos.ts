import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type FestivalPhoto = {
  id: string;
  storage_path: string;
  signed_url: string;
  caption: string | null;
  created_at: string;
};

async function fetchPhotos(userFestivalId: string): Promise<FestivalPhoto[]> {
  const { data, error } = await supabase
    .from('festival_photos')
    .select('id, storage_path, caption, created_at')
    .eq('user_festival_id', userFestivalId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const signed = await Promise.all(
    data.map(async (row) => {
      const { data: signedData } = await supabase.storage
        .from('festival-photos')
        .createSignedUrl(row.storage_path, 3600);
      return {
        id: row.id,
        storage_path: row.storage_path,
        signed_url: signedData?.signedUrl ?? '',
        caption: row.caption,
        created_at: row.created_at,
      };
    }),
  );

  return signed.filter((p) => p.signed_url);
}

export function useFestivalPhotos(userFestivalId: string | null) {
  return useQuery({
    queryKey: ['festival-photos', userFestivalId],
    queryFn: () => fetchPhotos(userFestivalId!),
    enabled: !!userFestivalId,
    staleTime: 50 * 60 * 1000,
  });
}
