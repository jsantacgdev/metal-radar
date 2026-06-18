import { getValidAccessToken } from './spotify-auth';

export type ExportResult = {
  playlistUrl: string;
  totalSongs: number;
  foundSongs: number;
  notFound: string[];
};

export type ExportSong = {
  title: string;
  artist: string;
};

async function getCurrentUserId(token: string): Promise<string> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo obtener el perfil de Spotify');
  const data = await res.json();
  return data.id;
}

/**
 * Busca una canción y devuelve el URI de Spotify, o null si no la encuentra.
 */
async function searchTrack(token: string, title: string, artist: string): Promise<string | null> {
  const query = encodeURIComponent(`track:${title} artist:${artist}`);
  const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.tracks?.items ?? [];
  return items[0]?.uri ?? null;
}

async function createPlaylist(
  token: string,
  userId: string,
  name: string,
  description: string,
): Promise<{ id: string; url: string }> {
  const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description,
      public: false,
    }),
  });
  if (!res.ok) throw new Error('No se pudo crear la playlist');
  const data = await res.json();
  return { id: data.id, url: data.external_urls.spotify };
}

async function addTracksToPlaylist(
  token: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  // Spotify acepta máximo 100 por llamada
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!res.ok) throw new Error('No se pudieron añadir canciones');
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

  const userId = await getCurrentUserId(token);

  // Buscar todas las canciones en paralelo
  const searchResults = await Promise.all(songs.map((s) => searchTrack(token, s.title, s.artist)));

  const foundUris: string[] = [];
  const notFound: string[] = [];

  searchResults.forEach((uri, i) => {
    if (uri) foundUris.push(uri);
    else notFound.push(songs[i].title);
  });

  // Crear playlist
  const playlist = await createPlaylist(token, userId, playlistName, description);

  // Añadir canciones encontradas
  if (foundUris.length > 0) {
    await addTracksToPlaylist(token, playlist.id, foundUris);
  }

  return {
    playlistUrl: playlist.url,
    totalSongs: songs.length,
    foundSongs: foundUris.length,
    notFound,
  };
}
