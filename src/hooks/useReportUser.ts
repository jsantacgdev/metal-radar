import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export function useReportUser(targetId: string, context: string) {
  return useMutation({
    mutationFn: async (reason?: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      const { error } = await supabase
        .from('user_reports')
        .insert({ reporter_id: user.id, reported_id: targetId, reason: reason ?? null, context });
      if (error) throw error;
    },
  });
}
