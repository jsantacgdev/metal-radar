import { supabase } from './supabase';

export type BandToFollow = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

export async function followBand(
  band: BandToFollow,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sin sesión');

  // Upsert en bands
  const { data: bandRow, error: bandError } =
    await supabase
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

  if (bandError || !bandRow)
    throw (
      bandError ??
      new Error('Error al guardar banda')
    );

  // Upsert en user_bands
  const { error: followError } = await supabase
    .from('user_bands')
    .upsert(
      { user_id: user.id, band_id: bandRow.id },
      { onConflict: 'user_id,band_id' },
    );

  if (followError) throw followError;
}
