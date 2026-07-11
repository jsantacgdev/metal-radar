import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { CommentTargetType } from './useComments';

type RatingStats = { average: number | null; count: number };

async function fetchRatingStats(
  targetType: CommentTargetType,
  targetId: string,
): Promise<RatingStats> {
  const fn = targetType === 'concert' ? 'concert_rating_stats' : 'festival_rating_stats';
  const param = targetType === 'concert' ? { p_concert_id: targetId } : { p_festival_id: targetId };
  const { data, error } = await supabase.rpc(fn, param);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    average: row?.avg_rating != null ? Number(row.avg_rating) : null,
    count: row?.rating_count ?? 0,
  };
}

export function useRatingStats(targetType: CommentTargetType, targetId: string | null) {
  const query = useQuery({
    queryKey: ['ratingStats', targetType, targetId],
    queryFn: () => fetchRatingStats(targetType, targetId as string),
    enabled: !!targetId,
  });

  return {
    average: query.data?.average ?? null,
    count: query.data?.count ?? 0,
    loading: query.isLoading,
  };
}
