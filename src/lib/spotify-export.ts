import { getValidAccessToken } from './spotify-auth';

export type ExportResult = {
  playlistUrl: string;
  playlistUri: string;
  totalSongs: number;
  foundSongs: number;
  notFound: string[];
};

export type ExportSong = {
  title: string;
  artist: string;
};

/**
 * Busca una canción y devuelve el URI de Spotify, o null si no la encuentra.
 */
/**
 * Busca una canción y devuelve el URI de Spotify, o null si no la encuentra.
 */
async function searchTrack(token: string, title: string, artist: string): Promise<string | null> {
  const query = encodeURIComponent(`track:${title} artist:${artist}`);

  const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(`[Spotify] Error buscando ${title}:`, res.status);
    return null;
  }

  const data = await res.json();
  const items = data.tracks?.items ?? [];
  return items[0]?.uri ?? null;
}

async function createPlaylist(
  token: string,
  name: string,
  description: string,
): Promise<{ id: string; url: string; uri: string }> {
  const body = {
    name,
    description,
    public: false,
  };

  const res = await fetch(`https://api.spotify.com/v1/me/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[Spotify] createPlaylist failed:', res.status, errText);
    throw new Error(`No se pudo crear la playlist: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return {
    id: data.id,
    url: data.external_urls.spotify,
    uri: data.uri, // ← ej: spotify:playlist:5Et65bL5Z5IX9gmgqWVk1j
  };
}

async function addTracksToPlaylist(
  token: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/items`;

  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: chunk }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[Spotify] Error de la API al añadir items:', res.status, errText);
        throw new Error(`Error ${res.status} añadiendo canciones: ${errText}`);
      }
    } catch (error) {
      console.error('[Spotify] Fallo en la petición fetch de addTracksToPlaylist:', error);
      throw error;
    }
  }
}

/**
 * Exporta un setlist como playlist de Spotify.
 */
export async function exportSetlistToSpotify(
  playlistName: string,
  description: string,
  songs: ExportSong[],
): Promise<ExportResult> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('No hay sesión de Spotify activa');

  const searchResults: (string | null)[] = [];

  for (const song of songs) {
    const uri = await searchTrack(token, song.title, song.artist);
    searchResults.push(uri);

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const foundUris: string[] = [];
  const notFound: string[] = [];

  searchResults.forEach((uri, i) => {
    if (uri) foundUris.push(uri);
    else notFound.push(songs[i].title);
  });

  const playlist = await createPlaylist(token, playlistName, description);

  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (foundUris.length > 0) {
    await addTracksToPlaylist(token, playlist.id, foundUris);
  }

  return {
    playlistUrl: playlist.url,
    playlistUri: playlist.uri,
    totalSongs: songs.length,
    foundSongs: foundUris.length,
    notFound,
  };
}
