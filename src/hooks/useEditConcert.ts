import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';
import { SubmitConcertInput } from './useSubmitConcert';

export function useEditConcert(concertId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitConcertInput) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error(i18n.t('errors.noSession'));

      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/moderate-concert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          concert_id: concertId,
          action: 'edit',
          event_date: input.event_date,
          event_time: input.event_time,
          ticket_url: input.ticket_url,
          venue: input.venue,
          bands: input.bands.map((b) => ({
            name: b.name,
            matched_band_id: b.matched_band_id,
            is_headliner: b.is_headliner,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        if (json.error === 'venue_geocode_failed') throw new Error(i18n.t('errors.venueGeocodeFailed'));
        throw new Error(json.error === 'forbidden' ? i18n.t('errors.forbidden') : (json.error ?? i18n.t('common.error')));
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concert', concertId] });
      queryClient.invalidateQueries({ queryKey: ['reportedConcerts'] });
      queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
    },
  });
}
