import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

type Args = {
  photoId: string;
  storagePath: string;
  userFestivalId: string;
};

export function useDeleteFestivalPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ photoId, storagePath }: Args) => {
      const { error: dbError } = await supabase.from('festival_photos').delete().eq('id', photoId);
      if (dbError) throw dbError;

      const { error: storageError } = await supabase.storage
        .from('festival-photos')
        .remove([storagePath]);
      if (storageError) console.warn('Foto borrada de BD pero no de storage:', storageError);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['festival-photos', vars.userFestivalId] });
    },
  });
}
