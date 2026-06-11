import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

type Args = {
  photoId: string;
  storagePath: string;
  userConcertId: string;
};

export function useDeleteConcertPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ photoId, storagePath }: Args) => {
      // Borrar primero la fila (RLS protege); el ON DELETE no toca storage
      const { error: dbError } = await supabase.from('concert_photos').delete().eq('id', photoId);
      if (dbError) throw dbError;

      // Borrar el archivo del bucket
      const { error: storageError } = await supabase.storage
        .from('concert-photos')
        .remove([storagePath]);
      if (storageError) console.warn('Foto borrada de BD pero no de storage:', storageError);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['concert-photos', vars.userConcertId] });
    },
  });
}
