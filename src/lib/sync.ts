import { supabase } from './supabase';
import i18n from '../i18n';

export type SyncResult = {
  synced: number;
  discarded: number;
  bands_skipped: number;
  /** Bandas pendientes que no entraron en este lote; las completa cron-sync-all. */
  bands_pending: number;
};

export async function syncAllConcerts(): Promise<SyncResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error(i18n.t('errors.noSession'));

  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/sync-concerts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const json = await res.json().catch(() => ({}));
  // Un 546 del runtime de Supabase trae { code, message } en vez de { error }.
  if (!res.ok || json.error) {
    throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`);
  }
  return {
    synced: json.synced ?? 0,
    discarded: json.discarded ?? 0,
    bands_skipped: json.bands_skipped ?? 0,
    bands_pending: json.bands_pending ?? 0,
  };
}
