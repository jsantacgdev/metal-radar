import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from '../i18n';
import { supabase } from '../lib/supabase';

export type ConcertDetail = {
  id: string;
  event_date: string;
  ticket_url: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  status: string;
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
  }[];
  userStatus: 'interested' | 'going' | 'attended' | null;
  userConcertId: string | null;
  rating: number | null;
  notes: string | null;
};

async function fetchConcert(concertId: string): Promise<ConcertDetail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data: concertData, error: cError } = await supabase
    .from('concerts')
    .select(
      `
      id, event_date, ticket_url, price_min, price_max, currency, status,
      venue:venues!inner ( id, name, city, country, lat, lng ),
      concert_bands ( band:bands ( id, name, image_url ) )
    `,
    )
    .eq('id', concertId)
    .single();

  if (cError) throw cError;

  const { data: ucData } = await supabase
    .from('user_concerts')
    .select('id, status, rating, notes')
    .eq('user_id', user.id)
    .eq('concert_id', concertId)
    .maybeSingle();

  const c: any = concertData;
  return {
    id: c.id,
    event_date: c.event_date,
    ticket_url: c.ticket_url,
    price_min: c.price_min,
    price_max: c.price_max,
    currency: c.currency,
    status: c.status,
    venue: c.venue,
    bands: c.concert_bands.map((cb: any) => cb.band),
    userStatus: ucData?.status ?? null,
    userConcertId: ucData?.id ?? null,
    rating: ucData?.rating ?? null,
    notes: ucData?.notes ?? null,
  };
}

export function useConcert(concertId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['concert', concertId],
    queryFn: () => fetchConcert(concertId),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['concert', concertId] });
    queryClient.invalidateQueries({ queryKey: ['diary'] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async (status: 'interested' | 'going' | 'attended' | null) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      if (status === null) {
        await supabase
          .from('user_concerts')
          .delete()
          .eq('user_id', user.id)
          .eq('concert_id', concertId);
      } else {
        await supabase.from('user_concerts').upsert(
          {
            user_id: user.id,
            concert_id: concertId,
            status,
          },
          { onConflict: 'user_id,concert_id' },
        );

        // Fire-and-forget: en cualquier estado intentamos cachear el setlist
        // si no existe ya. fetch-setlist es idempotente sin force=true.
        if (status === 'interested' || status === 'going' || status === 'attended') {
          supabase.functions
            .invoke('fetch-setlist', { body: { concertId } })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['setlists', concertId] });
            })
            .catch((e) => console.warn('Setlist fetch failed:', e.message));
        }
      }
    },
    onSuccess: invalidateAll,
  });

  const updateRatingMutation = useMutation({
    mutationFn: async (rating: number | null) => {
      const userConcertId = query.data?.userConcertId;
      if (!userConcertId) throw new Error(i18n.t('errors.markAttendedFirst'));
      const { error } = await supabase
        .from('user_concerts')
        .update({ rating, updated_at: new Date().toISOString() })
        .eq('id', userConcertId);
      if (error) throw error;
    },

    onMutate: async (rating) => {
      await queryClient.cancelQueries({ queryKey: ['concert', concertId] });
      const prev = queryClient.getQueryData<ConcertDetail>(['concert', concertId]);
      if (prev) {
        queryClient.setQueryData<ConcertDetail>(['concert', concertId], {
          ...prev,
          rating,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['concert', concertId], ctx.prev);
    },
    onSuccess: invalidateAll,
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const userConcertId = query.data?.userConcertId;
      if (!userConcertId) throw new Error(i18n.t('errors.markAttendedFirst'));
      const trimmed = notes.trim();
      const { error } = await supabase
        .from('user_concerts')
        .update({
          notes: trimmed.length === 0 ? null : trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userConcertId);
      if (error) throw error;
    },

    onMutate: async (notes) => {
      await queryClient.cancelQueries({ queryKey: ['concert', concertId] });
      const prev = queryClient.getQueryData<ConcertDetail>(['concert', concertId]);
      if (prev) {
        queryClient.setQueryData<ConcertDetail>(['concert', concertId], {
          ...prev,
          notes: notes.trim() || null,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['concert', concertId], ctx.prev);
    },
    onSuccess: invalidateAll,
  });

  return {
    concert: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
    updateStatus: (status: 'interested' | 'going' | 'attended' | null) =>
      updateStatusMutation.mutateAsync(status),
    updateRating: (rating: number | null) => updateRatingMutation.mutateAsync(rating),
    updateNotes: (notes: string) => updateNotesMutation.mutateAsync(notes),
  };
}
