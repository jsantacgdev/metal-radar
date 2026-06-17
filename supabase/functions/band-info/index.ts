import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MB_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)',
};

const STALE_DAYS = 30;

type Member = {
  name: string;
  begin?: string;
  end?: string;
  current: boolean;
};

type Lang = 'es' | 'en';

let cachedSpotifyToken: { value: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedSpotifyToken && cachedSpotifyToken.expiresAt > Date.now()) {
    return cachedSpotifyToken.value;
  }
  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token error: ${res.status}`);
  const data = await res.json();
  cachedSpotifyToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedSpotifyToken.value;
}

/**
 * Obtiene los datos de un artista por su Spotify ID (no por búsqueda).
 * Devuelve image_url y géneros, garantizado correctos.
 */
async function fetchSpotifyArtistById(
  spotifyId: string,
): Promise<{ image_url: string | null; genres: string[] } | null> {
  try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/artists/${spotifyId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`Spotify artist ${spotifyId} → ${res.status}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      image_url: data.images?.[0]?.url ?? null,
      genres: data.genres ?? [],
    };
  } catch (err) {
    console.log('fetchSpotifyArtistById error:', err);
    return null;
  }
}

/**
 * Busca el MBID de un artista en MusicBrainz a partir de su Spotify ID.
 */
async function findMbidBySpotify(spotifyId: string): Promise<string | null> {
  try {
    const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`;
    const url = `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(spotifyUrl)}&inc=artist-rels&fmt=json`;
    const res = await fetch(url, { headers: MB_HEADERS });
    console.log(`MB by Spotify ${spotifyId} → ${res.status}`);
    if (!res.ok) return null;
    const data = await res.json();
    const relation = (data.relations ?? []).find(
      (r: any) => r.type === 'free streaming' && r.artist?.id,
    );
    return relation?.artist?.id ?? null;
  } catch (err) {
    console.log('Error findMbidBySpotify:', err);
    return null;
  }
}

/**
 * Extrae el Spotify ID de las relaciones de MusicBrainz.
 */
async function findSpotifyIdFromMbid(mbid: string): Promise<string | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`;
    const res = await fetch(url, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const spotifyRel = (data.relations ?? []).find(
      (r: any) =>
        r.type === 'free streaming' &&
        r.url?.resource?.startsWith('https://open.spotify.com/artist/'),
    );
    if (!spotifyRel) return null;
    const match = spotifyRel.url.resource.match(/artist\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fallback: busca el MBID por nombre.
 */
async function searchMusicBrainzByName(name: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=5`;
  const res = await fetch(url, { headers: MB_HEADERS });
  console.log(`MB search by name "${name}" → ${res.status}`);
  if (!res.ok) return null;
  const data = await res.json();
  const artists = data.artists ?? [];
  const matched = artists.find((a: any) => a.name?.toLowerCase() === name.toLowerCase());
  return matched?.id ?? artists[0]?.id ?? null;
}

async function fetchMusicBrainzDetail(mbid: string) {
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=artist-rels+genres+tags&fmt=json`;
  const res = await fetch(url, { headers: MB_HEADERS });
  console.log(`MB detail ${mbid} → ${res.status}`);

  if (!res.ok) {
    return { formed_year: null, country: null, members: [], genres: [] };
  }

  const data = await res.json();

  const formed_year = data['life-span']?.begin
    ? parseInt(data['life-span'].begin.substring(0, 4))
    : null;

  const rawMembers = (data.relations || [])
    .filter((rel: any) => rel.type === 'member of band' && rel.artist)
    .map((rel: any) => ({
      name: rel.artist.name,
      begin: rel.begin || undefined,
      end: rel.end || undefined,
      current: !rel.ended,
    }));

  const membersMap = new Map<string, Member>();
  for (const m of rawMembers) {
    if (membersMap.has(m.name)) {
      const existing = membersMap.get(m.name)!;
      existing.current = existing.current || m.current;
      if (m.begin && (!existing.begin || m.begin < existing.begin)) existing.begin = m.begin;
      if (m.end && (!existing.end || m.end > existing.end)) existing.end = m.end;
    } else {
      membersMap.set(m.name, { ...m });
    }
  }
  const members: Member[] = Array.from(membersMap.values());

  const genres = (data.genres || []).map((g: any) => g.name);

  return {
    country: data.country || data.area?.iso_3166_1_codes?.[0] || null,
    formed_year,
    members,
    genres,
  };
}

/**
 * Obtiene la biografía de Last.fm en el idioma indicado.
 * Si se pasa mbid, lo usa para resolver homónimos correctamente.
 */
async function fetchLastfmBio(
  name: string,
  mbid: string | null,
  lang: Lang,
): Promise<string | null> {
  try {
    const params = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}`;
    const url = `http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&${params}&api_key=${LASTFM_API_KEY}&format=json&lang=${lang}&autocorrect=1`;
    const res = await fetch(url);

    console.log(`Last.fm ${lang} "${name}" (mbid=${mbid ?? 'none'}) → ${res.status}`);

    if (!res.ok) return null;

    const data = await res.json();
    const bioContent = data.artist?.bio?.content;

    if (!bioContent) return null;

    const clean = bioContent
      .replace(/<a[^>]*>.*?<\/a>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return clean.length > 0 ? clean : null;
  } catch (error) {
    console.log(`Last.fm fetch error:`, error);
    return null;
  }
}

async function fetchLastfmTags(name: string, mbid: string | null): Promise<string[]> {
  try {
    const params = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}`;
    const url = `http://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&${params}&api_key=${LASTFM_API_KEY}&format=json&autocorrect=1`;
    const res = await fetch(url);

    console.log(`Last.fm tags "${name}" (mbid=${mbid ?? 'none'}) → ${res.status}`);

    if (!res.ok) return [];

    const data = await res.json();
    const tags = data.toptags?.tag ?? [];

    // Filtrar tags genéricos sin valor descriptivo
    const blacklist = new Set([
      'seen live',
      'favorites',
      'favourite',
      'favourites',
      'spanish',
      'español',
      'all',
      'todo',
      'awesome',
      'epic',
    ]);

    return tags
      .filter((t: any) => {
        const name = (t.name ?? '').toLowerCase();
        const count = parseInt(t.count ?? '0', 10);
        return name && !blacklist.has(name) && count >= 5;
      })
      .slice(0, 6)
      .map((t: any) => t.name.toLowerCase());
  } catch (error) {
    console.log('Last.fm tags fetch error:', error);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header');

    // Si viene con service role key, es una llamada interna (refresh-all-bands)
    const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');
    }

    const body = await req.json();
    const band_id = body.band_id;
    const requestedLang: Lang = body.lang === 'en' ? 'en' : 'es';
    if (!band_id) throw new Error('Falta band_id');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: band, error } = await admin
      .from('bands')
      .select(
        'id, name, spotify_id, musicbrainz_mbid, mb_match_quality, bio_es, bio_en, formed_year, country, members, genres, image_url, info_synced_at',
      )
      .eq('id', band_id)
      .single();

    if (error || !band) throw new Error('Banda no encontrada');

    // ¿Caché válida?
    const staleSince = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const hasRichData =
      band.musicbrainz_mbid &&
      (band.formed_year || band.country || (band.members && (band.members as any[]).length > 0));

    if (band.info_synced_at && band.info_synced_at > staleSince && hasRichData) {
      return new Response(
        JSON.stringify({
          name: band.name,
          bio: requestedLang === 'en' ? (band.bio_en ?? band.bio_es) : (band.bio_es ?? band.bio_en),
          formed_year: band.formed_year,
          country: band.country,
          members: band.members ?? [],
          genres: band.genres ?? [],
          image_url: band.image_url,
          spotify_id: band.spotify_id,
          mb_match_quality: band.mb_match_quality,
          cached: true,
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Resolver MBID: primero por Spotify ID, fallback a búsqueda por nombre
    let mbid = band.musicbrainz_mbid as string | null;
    let matchQuality: 'verified' | 'unverified' = band.mb_match_quality ?? 'unverified';

    if (!mbid && band.spotify_id) {
      mbid = await findMbidBySpotify(band.spotify_id);
      if (mbid) {
        matchQuality = 'verified';
        console.log(`MBID by Spotify for "${band.name}" → verified`);
      }
    }

    if (!mbid) {
      mbid = await searchMusicBrainzByName(band.name);
      matchQuality = 'unverified';
      console.log(`MBID by name for "${band.name}" → unverified`);
    }

    const [mbDetail, bioEs, bioEn, correctSpotifyId, lastfmTags] = await Promise.all([
      mbid
        ? fetchMusicBrainzDetail(mbid)
        : Promise.resolve({ formed_year: null, country: null, members: [], genres: [] }),
      fetchLastfmBio(band.name, mbid, 'es'),
      fetchLastfmBio(band.name, mbid, 'en'),
      mbid ? findSpotifyIdFromMbid(mbid) : Promise.resolve(null),
      fetchLastfmTags(band.name, mbid),
    ]);

    // Detectar discrepancia entre el spotify_id guardado y el verificado por MusicBrainz
    const needsSpotifyRefresh =
      correctSpotifyId && band.spotify_id && correctSpotifyId !== band.spotify_id;

    if (needsSpotifyRefresh) {
      console.log(
        `Spotify mismatch for "${band.name}": stored=${band.spotify_id}, correct=${correctSpotifyId}`,
      );
    }

    const finalSpotifyId = needsSpotifyRefresh ? correctSpotifyId : band.spotify_id;

    // Refrescar imagen y géneros desde Spotify si hay mismatch o si faltan
    const needsImageRefresh =
      needsSpotifyRefresh || !band.image_url || !band.genres || band.genres.length === 0;

    let spotifyData: { image_url: string | null; genres: string[] } | null = null;
    if (needsImageRefresh && finalSpotifyId) {
      spotifyData = await fetchSpotifyArtistById(finalSpotifyId);
    }

    const updatePayload: any = {
      musicbrainz_mbid: mbid,
      mb_match_quality: matchQuality,
      bio_es: bioEs,
      bio_en: bioEn,
      formed_year: mbDetail.formed_year ?? null,
      country: mbDetail.country ?? null,
      members: mbDetail.members ?? [],
      info_synced_at: new Date().toISOString(),
    };

    if (needsSpotifyRefresh) {
      updatePayload.spotify_id = correctSpotifyId;
    }

    if (spotifyData) {
      updatePayload.image_url = spotifyData.image_url;
      const combined = Array.from(
        new Set([...spotifyData.genres, ...(mbDetail.genres ?? []), ...lastfmTags]),
      ).slice(0, 8);
      updatePayload.genres = combined;
    } else {
      const existingGenres = band.genres ?? [];
      const combinedGenres = Array.from(
        new Set([...existingGenres, ...(mbDetail.genres ?? []), ...lastfmTags]),
      ).slice(0, 8);
      updatePayload.genres = combinedGenres;
    }

    await admin.from('bands').update(updatePayload).eq('id', band.id);

    return new Response(
      JSON.stringify({
        name: band.name,
        bio: requestedLang === 'en' ? (bioEn ?? bioEs) : (bioEs ?? bioEn),
        formed_year: mbDetail.formed_year,
        country: mbDetail.country,
        members: mbDetail.members ?? [],
        genres: updatePayload.genres,
        image_url: updatePayload.image_url ?? band.image_url,
        spotify_id: updatePayload.spotify_id ?? band.spotify_id,
        mb_match_quality: matchQuality,
        cached: false,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
