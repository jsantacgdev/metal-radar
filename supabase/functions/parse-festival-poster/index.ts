import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mismo normalizador que enrich-bands para consistencia en el fuzzy match
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    const { imageBase64, mediaType = 'image/jpeg' } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 1. Llamar a Claude Vision
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageBase64 },
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

    // Limpiar markdown si lo hay y parsear
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

    // 2. Conectar a BD para fuzzy matching
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Buscar festival existente por nombre normalizado
    let existingFestivalId: string | null = null;
    if (parsed.festival_name) {
      const { data: festivals } = await admin.from('festivals').select('id, name');
      const normTarget = normalizeName(parsed.festival_name);
      const match = (festivals ?? []).find((f: any) => {
        const normF = normalizeName(f.name);
        return normF === normTarget || normF.includes(normTarget) || normTarget.includes(normF);
      });
      existingFestivalId = match?.id ?? null;
    }

    // 4. Buscar venue existente por nombre + ciudad
    let existingVenueId: string | null = null;
    if (parsed.venue_name) {
      const { data: venues } = await admin.from('venues').select('id, name, city');
      const normVenue = normalizeName(parsed.venue_name);
      const normCity = parsed.city ? normalizeName(parsed.city) : null;
      const match = (venues ?? []).find((v: any) => {
        const sameName = normalizeName(v.name) === normVenue;
        const sameCity = normCity ? normalizeName(v.city ?? '') === normCity : true;
        return sameName && sameCity;
      });
      existingVenueId = match?.id ?? null;
    }

    // 5. Fuzzy match de todas las bandas detectadas contra catálogo
    const { data: allBands } = await admin.from('bands').select('id, name');
    const bandsLookup = new Map<string, { id: string; name: string }>();
    (allBands ?? []).forEach((b: any) => {
      bandsLookup.set(normalizeName(b.name), { id: b.id, name: b.name });
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
          venue_name: parsed.venue_name ?? null,
          city: parsed.city ?? null,
          country: parsed.country ?? null,
          existing_festival_id: existingFestivalId,
          existing_venue_id: existingVenueId,
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
