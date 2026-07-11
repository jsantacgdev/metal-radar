import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type ReportedComment = {
  id: string;
  body: string;
  report_count: number;
  created_at: string;
  author: { username: string | null; display_name: string | null };
  reports: { reason: string | null; created_at: string }[];
  target: { kind: 'concert' | 'festival'; label: string };
};

async function fetchReportedComments(): Promise<ReportedComment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(
      `
      id, body, report_count, created_at,
      author:profiles!comments_author_id_fkey ( username, display_name ),
      comment_reports ( reason, created_at ),
      concert:concerts ( id, concert_bands ( is_headliner, band:bands ( name ) ) ),
      festival:festivals ( id, name )
    `,
    )
    .gt('report_count', 0)
    .order('report_count', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    let label = '';
    let kind: 'concert' | 'festival' = 'festival';
    if (row.concert) {
      kind = 'concert';
      const bands = row.concert.concert_bands ?? [];
      const headliner = bands.find((b: any) => b.is_headliner)?.band ?? bands[0]?.band;
      label = headliner?.name ?? '';
    } else if (row.festival) {
      label = row.festival.name;
    }
    return {
      id: row.id,
      body: row.body,
      report_count: row.report_count,
      created_at: row.created_at,
      author: row.author,
      reports: row.comment_reports ?? [],
      target: { kind, label },
    };
  });
}

export function useReportedComments() {
  const query = useQuery({
    queryKey: ['reportedComments'],
    queryFn: fetchReportedComments,
  });

  return {
    comments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
