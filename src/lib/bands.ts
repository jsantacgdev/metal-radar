import i18n from '../i18n';
import { supabase } from './supabase';

export type BandToFollow = {
  spotify_id: string | null;
  name: string;
  image_url: string | null;
  genres: string[];
};

export async function followBand(band: BandToFollow): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(i18n.t('errors.noSession'));

  const { data: existing } = await supabase
    .from('bands')
    .select('id, spotify_id, image_url, genres')
    .ilike('name', band.name)
    .maybeSingle();

  let bandId: string;

  if (existing) {
    const mergedGenres = Array.from(new Set([...(existing.genres ?? []), ...(band.genres ?? [])]));

    const { error: updateError } = await supabase
      .from('bands')
      .update({
        spotify_id: existing.spotify_id ?? band.spotify_id,
        image_url: existing.image_url ?? band.image_url,
        genres: mergedGenres,
      })
      .eq('id', existing.id);

    if (updateError) throw updateError;
    bandId = existing.id;
  } else {
    const { data: newBand, error: insertError } = await supabase
      .from('bands')
      .insert({
        spotify_id: band.spotify_id,
        name: band.name,
        image_url: band.image_url,
        genres: band.genres,
      })
      .select('id')
      .single();

    if (insertError || !newBand) throw insertError ?? new Error(i18n.t('errors.bandSaveFailed'));
    bandId = newBand.id;
  }

  const { error: followError } = await supabase
    .from('user_bands')
    .insert({ user_id: user.id, band_id: bandId });

  if (followError && followError.code !== '23505') throw followError;

  void prewarmBandMembers([bandId]);

  return bandId;
}

export async function syncBandConcerts(
  bandId: string,
): Promise<{ synced: number; discarded: number } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/sync-band`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ band_id: bandId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      console.warn('sync-band error:', json.error ?? json.message ?? `HTTP ${res.status}`);
      return null;
    }
    return {
      synced: json.synced ?? 0,
      discarded: json.discarded ?? 0,
    };
  } catch (err) {
    console.warn('sync-band fetch error:', err);
    return null;
  }
}

// Búsqueda de bandas (Edge Function search-bands), compartida por el radar,
// el onboarding y BandSearch. Cada pantalla tipa el resultado a su forma.
export async function searchBands<T>(query: string): Promise<T[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error(i18n.t('errors.noSession'));

  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/search-bands?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`);
  }
  return json.bands ?? [];
}

export async function getOrCreateBandId(spotify: {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
}): Promise<string> {
  const { data: bySpotifyId } = await supabase
    .from('bands')
    .select('id')
    .eq('spotify_id', spotify.spotify_id)
    .maybeSingle();

  if (bySpotifyId) return bySpotifyId.id;

  // Some bands are created without a spotify_id (OCR/user-submitted). Claim that
  // row instead of inserting a new one, or idx_bands_unique_name_lower rejects us.
  const { data: byName } = await supabase
    .from('bands')
    .select('id, image_url, genres')
    .ilike('name', spotify.name)
    .maybeSingle();

  if (byName) {
    const mergedGenres = Array.from(new Set([...(byName.genres ?? []), ...(spotify.genres ?? [])]));
    const { error: updateError } = await supabase
      .from('bands')
      .update({
        spotify_id: spotify.spotify_id,
        image_url: byName.image_url ?? spotify.image_url,
        genres: mergedGenres,
      })
      .eq('id', byName.id);
    if (updateError) throw updateError;
    return byName.id;
  }

  const { data: newBand, error: insertError } = await supabase
    .from('bands')
    .insert({
      spotify_id: spotify.spotify_id,
      name: spotify.name,
      image_url: spotify.image_url,
      genres: spotify.genres,
    })
    .select('id')
    .single();

  if (insertError || !newBand) throw insertError ?? new Error(i18n.t('errors.bandFetchFailed'));
  return newBand.id;
}

async function prewarmBandMembers(bandIds: string[]): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/prewarm-band-members`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ band_ids: bandIds }),
    });
  } catch {}
}
