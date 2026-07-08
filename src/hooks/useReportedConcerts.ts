import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type ReportedConcert = {
  id: string;
  event_date: string;
  report_count: number;
  venue: {
    name: string;
    city: string | null;
    country: string | null;
  };
  bands: { name: string; is_headliner: boolean }[];
  reports: { reason: string | null; created_at: string }[];
};

async function fetchReportedConcerts(): Promise<ReportedConcert[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data, error } = await supabase
    .from('concerts')
    .select(
      `
      id, event_date, report_count,
      venue:venues!inner ( name, city, country ),
      concert_bands ( is_headliner, band:bands ( name ) ),
      concert_reports ( reason, created_at )
    `,
    )
    .gt('report_count', 0)
    .order('report_count', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    event_date: row.event_date,
    report_count: row.report_count,
    venue: row.venue,
    bands: (row.concert_bands ?? [])
      .map((cb: any) => ({ name: cb.band.name, is_headliner: !!cb.is_headliner }))
      .sort((a: any, b: any) => Number(b.is_headliner) - Number(a.is_headliner)),
    reports: row.concert_reports ?? [],
  }));
}

export function useReportedConcerts() {
  const query = useQuery({
    queryKey: ['reportedConcerts'],
    queryFn: fetchReportedConcerts,
  });

  return {
    concerts: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}
