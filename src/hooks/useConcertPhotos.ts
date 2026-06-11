import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type ConcertPhoto = {
  id: string;
  storage_path: string;
  signed_url: string;
  caption: string | null;
  created_at: string;
};

async function fetchPhotos(userConcertId: string): Promise<ConcertPhoto[]> {
  const { data, error } = await supabase
    .from('concert_photos')
    .select('id, storage_path, caption, created_at')
    .eq('user_concert_id', userConcertId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Firmar todas las URLs en paralelo (válidas 1h)
  const signed = await Promise.all(
    data.map(async (row) => {
      const { data: signedData } = await supabase.storage
        .from('concert-photos')
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

export function useConcertPhotos(userConcertId: string | null) {
  return useQuery({
    queryKey: ['concert-photos', userConcertId],
    queryFn: () => fetchPhotos(userConcertId!),
    enabled: !!userConcertId,
    staleTime: 50 * 60 * 1000, // 50 min (las URLs firmadas duran 1h)
  });
}
