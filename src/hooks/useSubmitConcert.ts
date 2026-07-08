import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';
import { invalidateUserDataQueries } from '../lib/queryInvalidation';

export type SubmitConcertBand = {
  name: string;
  matched_band_id: string | null;
  image_url?: string | null;
  is_headliner: boolean;
  follow: boolean;
};

export type SubmitConcertInput = {
  event_date: string;
  event_time: string | null;
  ticket_url: string | null;
  venue: {
    id: string | null;
    name: string;
    city: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
  };
  bands: SubmitConcertBand[];
};

type SubmitConcertResponse = {
  concert_id: string;
  venue_id: string;
  created_venue: boolean;
  venue_geocode_strategy: 'venue' | 'city' | null;
  bands_added: number;
  bands_created: number;
  bands_reused: number;
  resolved_bands: { name: string; band_id: string | null }[];
};

async function submitConcert(input: SubmitConcertInput): Promise<SubmitConcertResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error(i18n.t('errors.noSession'));
  const user = session.user;

  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/submit-concert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
    if (json.error === 'rate_limited') throw new Error(i18n.t('errors.submitRateLimited'));
    if (json.error === 'venue_geocode_failed') throw new Error(i18n.t('errors.venueGeocodeFailed'));
    throw new Error(json.error || i18n.t('common.error'));
  }

  const result = json as SubmitConcertResponse;

  // Seguir solo las bandas marcadas por el usuario (mismo patrón que followBand en lib/bands.ts)
  const toFollow = input.bands
    .map((b, i) => ({ follow: b.follow, bandId: result.resolved_bands[i]?.band_id ?? null }))
    .filter((x) => x.follow && x.bandId);

  for (const { bandId } of toFollow) {
    const { error } = await supabase.from('user_bands').insert({ user_id: user.id, band_id: bandId });
    if (error && error.code !== '23505') {
      console.warn('Error al seguir banda tras enviar concierto:', error.message);
    }
  }

  return result;
}

export function useSubmitConcert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitConcert,
    onSuccess: () => {
      invalidateUserDataQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['followedBands'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });
}
