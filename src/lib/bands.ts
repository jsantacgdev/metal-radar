import { supabase } from './supabase';

export type BandToFollow = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

export async function followBand(band: BandToFollow): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sin sesión');

  const { data: bandRow, error: bandError } = await supabase
    .from('bands')
    .upsert(
      {
        spotify_id: band.spotify_id,
        name: band.name,
        image_url: band.image_url,
        genres: band.genres,
      },
      { onConflict: 'spotify_id' },
    )
    .select('id')
    .single();

  if (bandError || !bandRow) throw bandError ?? new Error('Error al guardar banda');

  const { error: followError } = await supabase
    .from('user_bands')
    .insert({ user_id: user.id, band_id: bandRow.id });

  if (followError && followError.code !== '23505') throw followError;

  return bandRow.id;
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
    const json = await res.json();
    if (json.error) {
      console.warn('sync-band error:', json.error);
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

export async function getOrCreateBandId(spotify: {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
}): Promise<string> {
  const { data, error } = await supabase
    .from('bands')
    .upsert(
      {
        spotify_id: spotify.spotify_id,
        name: spotify.name,
        image_url: spotify.image_url,
        genres: spotify.genres,
      },
      { onConflict: 'spotify_id' },
    )
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Error al obtener banda');
  return data.id;
}
