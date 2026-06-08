import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MB_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: tu@email.com)',
};

const STALE_DAYS = 30; // info de banda se refresca cada 30 días

type Member = {
  name: string;
  begin?: string;
  end?: string;
  current: boolean;
};

// Búsqueda en MusicBrainz por nombre
async function searchMusicBrainz(name: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=5`;
  const res = await fetch(url, { headers: MB_HEADERS });
  console.log(`MB search "${name}" → ${res.status}`);
  if (!res.ok) {
    console.log(`MB search error: ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  const artists = data.artists ?? [];
  console.log(
    `MB found ${artists.length} candidates: ${artists
      .slice(0, 3)
      .map((a: any) => a.name)
      .join(', ')}`,
  );
  const matched = artists.find((a: any) => a.name?.toLowerCase() === name.toLowerCase());
  const result = matched?.id ?? artists[0]?.id ?? null;
  console.log(`MB matched ID: ${result}`);
  return result;
}

// Datos detallados con miembros y géneros
async function fetchMusicBrainzDetail(mbid: string) {
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=artist-rels+genres+tags&fmt=json`;
  const res = await fetch(url, { headers: MB_HEADERS });
  console.log(`MB detail ${mbid} → ${res.status}`);

  if (!res.ok) {
    console.log(`MB detail error: ${await res.text()}`);
    return { formed_year: null, country: null, members: [], genres: [] };
  }

  const data = await res.json();

  // Extraer año de formación
  const formed_year = data['life-span']?.begin
    ? parseInt(data['life-span'].begin.substring(0, 4))
    : null;

  // Extraer miembros de las relaciones (artist-rels)
  // Extraer miembros en bruto de las relaciones (artist-rels)
  const rawMembers = (data.relations || [])
    .filter((rel: any) => rel.type === 'member of band' && rel.artist)
    .map((rel: any) => ({
      name: rel.artist.name,
      begin: rel.begin || undefined,
      end: rel.end || undefined,
      current: !rel.ended,
    }));

  // Eliminar duplicados fusionando sus periodos de actividad
  const membersMap = new Map<string, Member>();

  for (const m of rawMembers) {
    if (membersMap.has(m.name)) {
      const existing = membersMap.get(m.name)!;

      // Si en algún registro consta como miembro actual, se queda como actual
      existing.current = existing.current || m.current;

      // Nos quedamos con la fecha de entrada más antigua
      if (m.begin && (!existing.begin || m.begin < existing.begin)) {
        existing.begin = m.begin;
      }

      // Nos quedamos con la fecha de salida más reciente
      if (m.end && (!existing.end || m.end > existing.end)) {
        existing.end = m.end;
      }
    } else {
      membersMap.set(m.name, { ...m });
    }
  }

  // Convertir el Map de vuelta a un array
  const members: Member[] = Array.from(membersMap.values());

  // Extraer géneros
  const genres = (data.genres || []).map((g: any) => g.name);

  return {
    country: data.country || data.area?.iso_3166_1_codes?.[0] || null,
    formed_year,
    members,
    genres,
  };
}

// Biografía de Last.fm (completa y en español)
async function fetchLastfmBio(name: string): Promise<string | null> {
  try {
    // 1. Añadimos &lang=es a los parámetros de la URL
    const url = `http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(name)}&api_key=${LASTFM_API_KEY}&format=json&lang=es`;
    const res = await fetch(url);

    if (!res.ok) {
      console.log(`Last.fm error: ${res.status}`);
      return null;
    }

    const data = await res.json();

    // 2. Cambiamos 'summary' por 'content' para obtener el texto completo
    const bioContent = data.artist?.bio?.content;

    if (!bioContent) return null;

    // Limpiar tags HTML y el "<a href...>Read more</a>" final
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header');

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { band_id } = await req.json();
    if (!band_id) throw new Error('Falta band_id');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Leer banda
    const { data: band, error } = await admin
      .from('bands')
      .select(
        'id, name, musicbrainz_id, bio, formed_year, country, members, genres, info_synced_at',
      )
      .eq('id', band_id)
      .single();

    if (error || !band) throw new Error('Banda no encontrada');

    // ¿Caché válida?
    const staleSince = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const hasRichData =
      band.musicbrainz_id &&
      (band.formed_year || band.country || (band.members && (band.members as any[]).length > 0));

    if (band.info_synced_at && band.info_synced_at > staleSince && hasRichData) {
      return new Response(
        JSON.stringify({
          name: band.name,
          bio: band.bio,
          formed_year: band.formed_year,
          country: band.country,
          members: band.members ?? [],
          genres: band.genres ?? [],
          cached: true,
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Buscar MBID si no lo tenemos
    let mbid = band.musicbrainz_id as string | null;
    if (!mbid) {
      mbid = await searchMusicBrainz(band.name);
    }

    // Fetch en paralelo
    const [mbDetail, bio] = await Promise.all([
      mbid
        ? fetchMusicBrainzDetail(mbid)
        : Promise.resolve({ formed_year: null, country: null, members: [], genres: [] }),
      fetchLastfmBio(band.name),
    ]);

    // Mezclar géneros existentes con los nuevos (sin duplicar)
    const existingGenres = band.genres ?? [];
    const combinedGenres = Array.from(
      new Set([...existingGenres, ...(mbDetail.genres ?? [])]),
    ).slice(0, 8);

    // Guardar en BD
    await admin
      .from('bands')
      .update({
        musicbrainz_id: mbid,
        bio,
        formed_year: mbDetail.formed_year ?? null,
        country: mbDetail.country ?? null,
        members: mbDetail.members ?? [],
        genres: combinedGenres,
        info_synced_at: new Date().toISOString(),
      })
      .eq('id', band.id);

    return new Response(
      JSON.stringify({
        name: band.name,
        bio,
        formed_year: mbDetail.formed_year,
        country: mbDetail.country,
        members: mbDetail.members ?? [],
        genres: combinedGenres,
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
