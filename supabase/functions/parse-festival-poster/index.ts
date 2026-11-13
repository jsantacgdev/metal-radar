import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Llamadas internas de process-poster-inbox (carteles subidos desde el PC).
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const unauthorized = () =>
  new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clave de festival sin el año: "Resurrection Fest 2026" y "Resurrection Fest"
// son el mismo festival (en distintas ediciones).
function festivalKey(name: string): string {
  return normalizeName(name)
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function yearOf(date: string | null | undefined): number | null {
  const m = /^(\d{4})-/.exec(date ?? '');
  return m ? Number(m[1]) : null;
}

// PostgREST devuelve como mucho 1000 filas por consulta: con más de 11.000
// bandas, un select sin paginar solo comparaba con las 1000 primeras y la
// revisión marcaba como "a crear" bandas que ya existían.
async function selectAll(admin: any, table: string, columns: string): Promise<any[]> {
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const PROMPT = `Analiza este cartel de festival de música. Devuelve EXCLUSIVAMENTE un JSON válido, sin texto antes ni después, sin markdown, sin comentarios.

Estructura exacta del JSON:
{
  "festival_name": "nombre del festival sin el año",
  "year": 2026,
  "start_date": "2026-07-01",
  "end_date": "2026-07-04",
  "venue_name": "nombre del recinto si aparece",
  "city": "ciudad",
  "country": "ES",
  "bands": [
    { "name": "IRON MAIDEN", "tier": "headliner" },
    { "name": "MASTODON", "tier": "subheadliner" },
    { "name": "BANDA PEQUEÑA", "tier": "lineup" }
  ]
}

Reglas:
- Si un campo no está en el cartel, ponlo como null (excepto "bands" que siempre debe ser un array)
- Las fechas en formato YYYY-MM-DD. Si solo hay año, deja start_date y end_date como null.
- "country" en código ISO 2 letras (ES, FR, DE, GB, US, etc.)
- Tier "headliner": las 3-5 bandas más grandes, normalmente arriba del cartel y con tipografía más grande
- Tier "subheadliner": bandas intermedias, segundo nivel jerárquico
- Tier "lineup": el resto del cartel
- NO incluyas: días de la semana, escenarios ("Main Stage", "Stage 2"), patrocinadores, "Special guest", "+", numeración de tickets, ni cualquier elemento que no sea una banda
- Mantén el ORDEN visual: bandas más arriba/grandes primero
- Si dudas de la transcripción de un nombre, escríbelo lo más fiel posible al cartel
- Acentos, ñ, símbolos como umlauts: respétalos`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // process-poster-inbox (carteles subidos desde el PC al bucket
    // festival-posters-inbox) llama con CRON_SECRET en vez de con un usuario.
    const isInternal = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
    if (!isInternal) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();
      if (userError || !user) return unauthorized();

      // Herramienta solo para admins: importar carteles crea/edita festivales
      // reales — no basta con ocultar el botón en el cliente.
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // imageUrl: URL firmada del bucket festival-posters-inbox (process-poster-inbox),
    // para no mandar pósters de varios MB en base64 dentro del JSON.
    const { imageBase64, mediaType = 'image/jpeg', imageUrl } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ error: 'imageBase64 or imageUrl required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const imageSource = imageBase64
      ? { type: 'base64', media_type: mediaType, data: imageBase64 }
      : { type: 'url', url: imageUrl };

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        // Un cartel grande (~180 bandas) pasa de 4096 tokens de JSON y se cortaba.
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: imageSource,
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      return new Response(
        JSON.stringify({
          error: `Claude API ${claudeRes.status}: ${errBody.slice(0, 300)}`,
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    const cleanText = rawText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Claude no devolvió JSON válido',
          raw: rawText.slice(0, 600),
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Un festival se repite cada año con el mismo nombre. Solo es la misma
    // edición (se actualizará) si coincide el año; si no, se creará un festival
    // nuevo y se propone el recinto de la edición anterior. Antes se emparejaba
    // solo por nombre y un cartel de 2027 sobrescribía el festival de 2026.
    const parsedYear: number | null =
      yearOf(parsed.start_date) ?? (Number.isInteger(parsed.year) ? parsed.year : null);
    let existingFestivalId: string | null = null;
    let previousEdition: {
      id: string;
      name: string;
      start_date: string | null;
      venue_id: string | null;
    } | null = null;
    if (parsed.festival_name) {
      const target = festivalKey(parsed.festival_name);
      const { data: festivals } = await admin
        .from('festivals')
        .select('id, name, start_date, end_date, venue_id');
      const sameFestival = (festivals ?? []).filter((f: any) => {
        const key = festivalKey(f.name);
        return (
          !!target && !!key && (key === target || key.includes(target) || target.includes(key))
        );
      });
      const today = new Date().toISOString().split('T')[0];
      const sameEdition = sameFestival.find((f: any) =>
        parsedYear != null
          ? yearOf(f.start_date) === parsedYear
          : // Sin año en el cartel: es la misma edición la que aún no se ha celebrado.
            !f.end_date || f.end_date >= today,
      );
      if (sameEdition) {
        existingFestivalId = sameEdition.id;
      } else if (sameFestival.length > 0) {
        previousEdition = [...sameFestival].sort((a: any, b: any) =>
          (b.start_date ?? '').localeCompare(a.start_date ?? ''),
        )[0];
      }
    }

    let existingVenueId: string | null = null;
    let venueName: string | null = parsed.venue_name ?? null;
    let venueCity: string | null = parsed.city ?? null;
    let venueCountry: string | null = parsed.country ?? null;

    // Nueva edición: por defecto, el recinto de la edición anterior (se puede
    // cambiar en la revisión; al editarlo se descarta este emparejamiento).
    if (previousEdition?.venue_id) {
      const { data: prevVenue } = await admin
        .from('venues')
        .select('id, name, city, country')
        .eq('id', previousEdition.venue_id)
        .maybeSingle();
      if (prevVenue) {
        existingVenueId = prevVenue.id;
        venueName = prevVenue.name;
        venueCity = prevVenue.city;
        venueCountry = prevVenue.country;
      }
    }

    if (!existingVenueId && parsed.venue_name) {
      const venues = await selectAll(admin, 'venues', 'id, name, city');
      const normVenue = normalizeName(parsed.venue_name);
      const normCity = parsed.city ? normalizeName(parsed.city) : null;
      const match = (venues ?? []).find((v: any) => {
        const sameName = normalizeName(v.name) === normVenue;
        const sameCity = normCity ? normalizeName(v.city ?? '') === normCity : true;
        return sameName && sameCity;
      });
      existingVenueId = match?.id ?? null;
    }

    const allBands = await selectAll(admin, 'bands', 'id, name');
    const bandsLookup = new Map<string, { id: string; name: string }>();
    allBands.forEach((b: any) => {
      const key = normalizeName(b.name);
      // Con nombres duplicados se queda la primera, como en commit (ilike + limit 1).
      if (key && !bandsLookup.has(key)) bandsLookup.set(key, { id: b.id, name: b.name });
    });

    const matchedBands = (parsed.bands ?? []).map((b: any) => {
      const normExtracted = normalizeName(b.name);
      const match = bandsLookup.get(normExtracted);
      return {
        extracted_name: b.name,
        matched_band_id: match?.id ?? null,
        matched_band_name: match?.name ?? null,
        tier: ['headliner', 'subheadliner', 'lineup'].includes(b.tier) ? b.tier : 'lineup',
      };
    });

    return new Response(
      JSON.stringify({
        festival: {
          name: parsed.festival_name ?? null,
          year: parsed.year ?? null,
          start_date: parsed.start_date ?? null,
          end_date: parsed.end_date ?? null,
          venue_name: venueName,
          city: venueCity,
          country: venueCountry,
          existing_festival_id: existingFestivalId,
          existing_venue_id: existingVenueId,
          previous_edition: previousEdition
            ? {
                id: previousEdition.id,
                name: previousEdition.name,
                year: yearOf(previousEdition.start_date),
              }
            : null,
        },
        bands: matchedBands,
        stats: {
          total: matchedBands.length,
          matched: matchedBands.filter((b: any) => b.matched_band_id !== null).length,
          to_create: matchedBands.filter((b: any) => b.matched_band_id === null).length,
        },
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
