import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invalidateUserDataQueries } from '../lib/queryInvalidation';

type Args = {
  userConcertId: string;
  status: 'interested' | 'going' | 'attended';
};

export function useUpdateConcertStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userConcertId, status }: Args) => {
      const { error } = await supabase
        .from('user_concerts')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', userConcertId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateUserDataQueries(queryClient);
    },
  });
}
