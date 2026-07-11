import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type ActivityEventType =
  | 'concert_going'
  | 'concert_attended'
  | 'concert_rated'
  | 'festival_going'
  | 'festival_attended'
  | 'festival_rated'
  | 'user_followed';

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  created_at: string;
  rating: number | null;
  actor: { id: string; username: string | null; display_name: string | null };
  targetUser: { id: string; username: string | null; display_name: string | null } | null;
  concert: {
    id: string;
    event_date: string;
    venue: { name: string; city: string | null };
    headlinerName: string | null;
    headlinerImage: string | null;
  } | null;
  festival: {
    id: string;
    name: string;
    start_date: string;
    image_url: string | null;
  } | null;
};

const FEED_LIMIT = 50;

async function fetchActivityFeed(): Promise<ActivityEvent[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data, error } = await supabase
    .from('activity_events')
    .select(
      `
      id, type, created_at, rating,
      actor:profiles!activity_events_actor_id_fkey ( id, username, display_name ),
      target_user:profiles!activity_events_target_user_id_fkey ( id, username, display_name ),
      concert:concerts (
        id, event_date,
        venue:venues!inner ( name, city ),
        concert_bands ( is_headliner, band:bands ( name, image_url ) )
      ),
      festival:festivals ( id, name, start_date, image_url )
    `,
    )
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT);

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => {
    const bands = row.concert?.concert_bands ?? [];
    const headliner = bands.find((b: any) => b.is_headliner)?.band ?? bands[0]?.band ?? null;
    return {
      id: row.id,
      type: row.type,
      created_at: row.created_at,
      rating: row.rating,
      actor: row.actor,
      targetUser: row.target_user,
      concert: row.concert
        ? {
            id: row.concert.id,
            event_date: row.concert.event_date,
            venue: row.concert.venue,
            headlinerName: headliner?.name ?? null,
            headlinerImage: headliner?.image_url ?? null,
          }
        : null,
      festival: row.festival,
    };
  });
}

export function useActivityFeed() {
  const query = useQuery({
    queryKey: ['activityFeed'],
    queryFn: fetchActivityFeed,
  });

  return {
    events: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
