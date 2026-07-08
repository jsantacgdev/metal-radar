import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export function useReportConcert(concertId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason?: string) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error(i18n.t('errors.noSession'));

      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/report-concert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ concert_id: concertId, reason }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(
          json.error === 'already_reported' ? i18n.t('errors.alreadyReported') : i18n.t('common.error'),
        );
      }
      return json as { report_count: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concert', concertId] });
    },
  });
}
