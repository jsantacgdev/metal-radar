import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SECRET = Deno.env.get('ADMIN_SECRET')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MB_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)',
};

const HEAVY_GENRE_REGEX =
  /metal|rock|ska|hardcore|punk|metalcore|deathcore|grunge|emo|screamo|thrash|doom|sludge|stoner|industrial|gothic|prog|alternative|nu.?metal|post.?punk|psychedelic|garage|indie/i;

const RATE_LIMIT_MS = 1100;

type Member = {
  name: string;
  begin?: string;
  end?: string;
  current: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function fetchSpotifyArtistById(spotifyId: string) {
  try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/artists/${spotifyId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      image_url: data.images?.[0]?.url ?? null,
      genres: data.genres ?? [],
    };
  } catch {
    return null;
  }
}

async function findMbidBySpotify(spotifyId: string): Promise<string | null> {
  try {
    const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`;
    const url = `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(spotifyUrl)}&inc=artist-rels&fmt=json`;
    const res = await fetch(url, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const relation = (data.relations ?? []).find(
      (r: any) => r.type === 'free streaming' && r.artist?.id,
    );
    return relation?.artist?.id ?? null;
  } catch {
    return null;
  }
}

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

async function searchMusicBrainzByName(name: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=5`;
  const res = await fetch(url, { headers: MB_HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  const artists = data.artists ?? [];
  const matched = artists.find((a: any) => a.name?.toLowerCase() === name.toLowerCase());
  return matched?.id ?? artists[0]?.id ?? null;
}

async function fetchMusicBrainzDetail(mbid: string) {
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=artist-rels+genres+tags&fmt=json`;
  const res = await fetch(url, { headers: MB_HEADERS });

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

  const officialGenres = (data.genres || []).map((g: any) => g.name);
  const tags = (data.tags || [])
    .filter((t: any) => (t.count ?? 0) >= 1 && HEAVY_GENRE_REGEX.test(t.name ?? ''))
    .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))
    .map((t: any) => t.name);
  const genres = Array.from(new Set([...officialGenres, ...tags]));

  return {
    country: data.country || data.area?.iso_3166_1_codes?.[0] || null,
    formed_year,
    members,
    genres,
  };
}

async function fetchLastfmBio(name: string, mbid: string | null, lang: 'es' | 'en') {
  try {
    const params = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}`;
    const url = `http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&${params}&api_key=${LASTFM_API_KEY}&format=json&lang=${lang}&autocorrect=1`;
    const res = await fetch(url);
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
  } catch {
    return null;
  }
}

async function fetchLastfmTags(name: string, mbid: string | null): Promise<string[]> {
  try {
    const params = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name)}`;
    const url = `http://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&${params}&api_key=${LASTFM_API_KEY}&format=json&autocorrect=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const tags = data.toptags?.tag ?? [];
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
        const tagName = (t.name ?? '').toLowerCase();
        const count = parseInt(t.count ?? '0', 10);
        return tagName && !blacklist.has(tagName) && count >= 5 && HEAVY_GENRE_REGEX.test(tagName);
      })
      .slice(0, 6)
      .map((t: any) => t.name.toLowerCase());
  } catch {
    return [];
  }
}

async function refreshBand(admin: any, band: any): Promise<void> {
  let mbid: string | null = null;
  let matchQuality: 'verified' | 'unverified' = 'unverified';

  if (band.spotify_id) {
    mbid = await findMbidBySpotify(band.spotify_id);
    if (mbid) matchQuality = 'verified';
  }

  if (!mbid) {
    mbid = await searchMusicBrainzByName(band.name);
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

  const needsSpotifyRefresh =
    correctSpotifyId && band.spotify_id && correctSpotifyId !== band.spotify_id;
  const finalSpotifyId = needsSpotifyRefresh ? correctSpotifyId : band.spotify_id;

  let spotifyData: { image_url: string | null; genres: string[] } | null = null;
  if (finalSpotifyId) {
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
  }

  const combined = Array.from(
    new Set([...(spotifyData?.genres ?? []), ...(mbDetail.genres ?? []), ...lastfmTags]),
  ).slice(0, 8);
  updatePayload.genres = combined;

  const { error: updateError } = await admin.from('bands').update(updatePayload).eq('id', band.id);

  if (updateError) throw new Error(`No se pudo guardar: ${updateError.message}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const offset = body.offset ?? 0;
    const limit = body.limit ?? 200;
    const onlyUnverified = body.only_unverified === true;

    let query = admin
      .from('bands')
      .select('id, name, spotify_id, mb_match_quality')
      .order('created_at', { ascending: true });

    const onlyUnsynced = body.only_unsynced === true;

    if (onlyUnsynced) {
      query = query.is('info_synced_at', null);
    } else if (onlyUnverified) {
      query = query.or('mb_match_quality.is.null,mb_match_quality.eq.unverified');
    }

    const { data: bands, error } = await query.range(offset, offset + limit - 1);

    if (error) throw error;
    if (!bands || bands.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No bands to process' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[refresh-all-bands] Starting refresh of ${bands.length} bands (offset=${offset})`);

    let processed = 0;
    let failed = 0;
    const errors: { band: string; error: string }[] = [];

    for (const band of bands) {
      try {
        await refreshBand(admin, band);
        processed++;
      } catch (err) {
        failed++;
        errors.push({ band: band.name, error: (err as Error).message });
        console.warn(`[refresh-all-bands] ERROR "${band.name}": ${(err as Error).message}`);
      }

      if ((processed + failed) % 25 === 0) {
        console.log(
          `[refresh-all-bands] Progress: ${processed + failed}/${bands.length} (${processed} OK, ${failed} failed)`,
        );
      }

      await sleep(RATE_LIMIT_MS);
    }

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[refresh-all-bands] DONE in ${durationSec}s. Processed: ${processed}, Failed: ${failed}`,
    );

    return new Response(
      JSON.stringify({
        processed,
        failed,
        duration_seconds: durationSec,
        total_bands: bands.length,
        next_offset: offset + bands.length,
        errors: errors.slice(0, 20),
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
