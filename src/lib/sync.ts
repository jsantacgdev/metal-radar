import { supabase } from './supabase';

export type SyncResult = {
  synced: number;
  discarded: number;
  bands_skipped: number;
};

export async function syncAllConcerts(): Promise<SyncResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Sin sesión');

  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/sync-concerts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return {
    synced: json.synced ?? 0,
    discarded: json.discarded ?? 0,
    bands_skipped: json.bands_skipped ?? 0,
  };
}
