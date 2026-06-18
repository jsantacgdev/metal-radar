import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type FestivalDetail = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  ticket_url: string | null;
  official_url: string | null;
  image_url: string | null;
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
    is_headliner: boolean;
    is_followed: boolean;
  }[];
  followed_count: number;
  userStatus: 'interested' | 'going' | 'attended' | null;
  userFestivalId: string | null;
  rating: number | null;
  notes: string | null;
};

async function fetchFestival(festivalId: string): Promise<FestivalDetail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data, error } = await supabase
    .from('festivals')
    .select(
      `
      id, name, description, start_date, end_date, ticket_url, official_url, image_url,
      venue:venues!inner ( id, name, city, country, lat, lng ),
      festival_bands (
        is_headliner,
        band:bands ( id, name, image_url )
      )
    `,
    )
    .eq('id', festivalId)
    .single();

  if (error) throw error;

  const { data: userBands } = await supabase
    .from('user_bands')
    .select('band_id')
    .eq('user_id', user.id);

  const followedIds = new Set((userBands ?? []).map((ub: any) => ub.band_id));

  const { data: ufData } = await supabase
    .from('user_festivals')
    .select('id, status, rating, notes')
    .eq('user_id', user.id)
    .eq('festival_id', festivalId)
    .maybeSingle();

  const f: any = data;
  const bands = (f.festival_bands ?? [])
    .map((fb: any) => ({
      id: fb.band.id,
      name: fb.band.name,
      image_url: fb.band.image_url,
      is_headliner: fb.is_headliner ?? false,
      is_followed: followedIds.has(fb.band.id),
    }))
    .sort((a: any, b: any) => {
      if (a.is_followed !== b.is_followed) return a.is_followed ? -1 : 1;
      if (a.is_headliner !== b.is_headliner) return a.is_headliner ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    id: f.id,
    name: f.name,
    description: f.description,
    start_date: f.start_date,
    end_date: f.end_date,
    ticket_url: f.ticket_url,
    official_url: f.official_url,
    image_url: f.image_url,
    venue: f.venue,
    bands,
    followed_count: bands.filter((b: any) => b.is_followed).length,
    userStatus: ufData?.status ?? null,
    userFestivalId: ufData?.id ?? null,
    rating: ufData?.rating ?? null,
    notes: ufData?.notes ?? null,
  };
}

export function useFestival(festivalId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['festival', festivalId],
    queryFn: () => fetchFestival(festivalId),
    enabled: !!festivalId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: 'interested' | 'going' | 'attended' | null) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      if (status === null) {
        const { error } = await supabase
          .from('user_festivals')
          .delete()
          .eq('user_id', user.id)
          .eq('festival_id', festivalId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_festivals').upsert(
          {
            user_id: user.id,
            festival_id: festivalId,
            status,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,festival_id' },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festival', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
      queryClient.invalidateQueries({ queryKey: ['diary'] });
    },
  });

  const updateRatingMutation = useMutation({
    mutationFn: async (rating: number | null) => {
      const userFestivalId = query.data?.userFestivalId;
      if (!userFestivalId) throw new Error(i18n.t('errors.markAttendedFirst'));
      const { error } = await supabase
        .from('user_festivals')
        .update({ rating, updated_at: new Date().toISOString() })
        .eq('id', userFestivalId);
      if (error) throw error;
    },
    onMutate: async (rating) => {
      await queryClient.cancelQueries({ queryKey: ['festival', festivalId] });
      const prev = queryClient.getQueryData<FestivalDetail>(['festival', festivalId]);
      if (prev) {
        queryClient.setQueryData<FestivalDetail>(['festival', festivalId], {
          ...prev,
          rating,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['festival', festivalId], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festival', festivalId] });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const userFestivalId = query.data?.userFestivalId;
      if (!userFestivalId) throw new Error(i18n.t('errors.markAttendedFirst'));
      const trimmed = notes.trim();
      const { error } = await supabase
        .from('user_festivals')
        .update({
          notes: trimmed.length === 0 ? null : trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userFestivalId);
      if (error) throw error;
    },
    onMutate: async (notes) => {
      await queryClient.cancelQueries({ queryKey: ['festival', festivalId] });
      const prev = queryClient.getQueryData<FestivalDetail>(['festival', festivalId]);
      if (prev) {
        queryClient.setQueryData<FestivalDetail>(['festival', festivalId], {
          ...prev,
          notes: notes.trim() || null,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['festival', festivalId], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festival', festivalId] });
    },
  });

  return {
    festival: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
    updateStatus: (status: 'interested' | 'going' | 'attended' | null) =>
      updateStatusMutation.mutateAsync(status),
    updateRating: (rating: number | null) => updateRatingMutation.mutateAsync(rating),
    updateNotes: (notes: string) => updateNotesMutation.mutateAsync(notes),
  };
}
