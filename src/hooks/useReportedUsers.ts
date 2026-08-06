import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

export type ReportedUser = {
  reportedId: string;
  username: string | null;
  display_name: string | null;
  report_count: number;
  reports: { reason: string | null; context: string | null; created_at: string }[];
};

async function fetchReportedUsers(): Promise<ReportedUser[]> {
  const { data, error } = await supabase
    .from('user_reports')
    .select(
      'reported_id, reason, context, created_at, reported:profiles!user_reports_reported_id_fkey ( username, display_name )',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const grouped = new Map<string, ReportedUser>();
  for (const row of (data ?? []) as any[]) {
    const entry = { reason: row.reason, context: row.context, created_at: row.created_at };
    const existing = grouped.get(row.reported_id);
    if (existing) {
      existing.reports.push(entry);
      existing.report_count += 1;
    } else {
      grouped.set(row.reported_id, {
        reportedId: row.reported_id,
        username: row.reported?.username ?? null,
        display_name: row.reported?.display_name ?? null,
        report_count: 1,
        reports: [entry],
      });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.report_count - a.report_count);
}

export function useReportedUsers() {
  const query = useQuery({ queryKey: ['reportedUsers'], queryFn: fetchReportedUsers });
  return {
    users: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload: query.refetch,
  };
}

export function useDismissUserReports() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportedId: string) => {
      const { error } = await supabase.from('user_reports').delete().eq('reported_id', reportedId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reportedUsers'] }),
  });
}

export type BanDuration = '24h' | '7d' | 'permanent';

export function useModerateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      action,
      duration,
    }: {
      userId: string;
      action: 'ban' | 'unban';
      duration?: BanDuration;
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error(i18n.t('errors.noSession'));

      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/moderate-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, action, duration }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        const key =
          json.error === 'forbidden'
            ? 'errors.forbidden'
            : json.error === 'cannot_ban_self'
              ? 'moderation.cannotBanSelf'
              : json.error === 'cannot_ban_admin'
                ? 'moderation.cannotBanAdmin'
                : null;
        throw new Error(key ? i18n.t(key) : (json.error ?? i18n.t('common.error')));
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportedUsers'] });
      queryClient.invalidateQueries({ queryKey: ['bannedUsers'] });
    },
  });
}
