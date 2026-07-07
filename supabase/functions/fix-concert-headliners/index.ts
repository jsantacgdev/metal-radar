import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 15;
const DELAY_MS = 300; // cortesía con la API de Ticketmaster (1 evento por request)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Misma heurística que sync-concerts: `_embedded.attractions` no viene ordenado
 * por billing, pero el nombre del evento casi siempre lleva el del headliner.
 */
function findHeadlinerIndex(eventName: string, attractions: { name?: string }[]): number {
  const normEvent = normalizeName(eventName);

  const exactIdx = attractions.findIndex((a) => a.name && normalizeName(a.name) === normEvent);
  if (exactIdx !== -1) return exactIdx;

  const containedIdx = attractions.findIndex(
    (a) => a.name && normEvent.includes(normalizeName(a.name)),
  );
  if (containedIdx !== -1) return containedIdx;

  return 0;
}

/**
 * Extrae el nombre del tour del nombre del evento de Ticketmaster.
 * Patrón típico: "ARTIST - Tour Name 2026" → "Tour Name 2026"
 */
function extractTourName(eventName: string, attractionName: string): string | null {
  if (!eventName || !attractionName) return null;

  const eventLower = eventName.toLowerCase().trim();
  const artistLower = attractionName.toLowerCase().trim();

  if (!eventLower.startsWith(artistLower)) return null;

  const rest = eventName.slice(attractionName.length).trimStart();
  const separators = [' - ', ' – ', ' — ', ': ', '- ', '– ', '— ', ':'];

  for (const sep of separators) {
    if (rest.startsWith(sep)) {
      const tour = rest.slice(sep.length).trim();
      return tour.length > 0 ? tour : null;
    }
  }

  if (rest.length > 0 && rest !== eventName) {
    return rest;
  }
  return null;
}

type TmAttraction = {
  id: string;
  name: string;
  externalLinks?: { musicbrainz?: { id: string }[] };
};

/**
 * Backfill: recorre conciertos ya sincronizados, vuelve a pedir el evento a
 * Ticketmaster y corrige lo que `sync-concerts` guardó mal antes del fix:
 * - `concert_bands.is_headliner` (usaba idx===0, no billing real)
 * - `concerts.tour_name` (no se guardaba en el sync masivo, solo en sync-band)
 * - `bands.musicbrainz_mbid` (idem)
 * Sin tour_name + mbid, fetch-setlist nunca puede buscar el setlist por gira.
 * Paginado con offset/batch para poder llamarlo en bucle hasta done=true.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const batchSize = parseInt(url.searchParams.get('batch') ?? `${BATCH_SIZE}`, 10);

    const { data: concerts, error } = await admin
      .from('concerts')
      .select(
        `
        id, ticketmaster_id, tour_name,
        concert_bands ( band_id, is_headliner, band:bands ( id, name, ticketmaster_id, musicbrainz_mbid ) )
      `,
      )
      .not('ticketmaster_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;

    const totals = {
      processed: 0,
      headliner_updated: 0,
      headliner_unchanged: 0,
      headliner_unmatched: 0,
      tour_name_updated: 0,
      mbid_updated: 0,
      expired_on_tm: 0,
      errors: 0,
      next_offset: offset + batchSize,
      done: false,
    };

    if (!concerts || concerts.length === 0) {
      totals.done = true;
      return new Response(JSON.stringify(totals), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    totals.processed = concerts.length;

    for (const concert of concerts as any[]) {
      try {
        const tmUrl =
          `https://app.ticketmaster.com/discovery/v2/events/${concert.ticketmaster_id}.json` +
          `?apikey=${TICKETMASTER_API_KEY}`;
        const res = await fetch(tmUrl);

        if (res.status === 404) {
          totals.expired_on_tm++;
          await sleep(DELAY_MS);
          continue;
        }
        if (!res.ok) {
          totals.errors++;
          await sleep(DELAY_MS);
          continue;
        }

        const ev = await res.json();
        const attractions: TmAttraction[] = ev._embedded?.attractions ?? [];
        if (attractions.length === 0) {
          await sleep(DELAY_MS);
          continue;
        }

        const headlinerIdx = findHeadlinerIndex(ev.name, attractions);
        const headlinerAttr = attractions[headlinerIdx];

        // 1. tour_name (fetch-setlist lo necesita para el fallback por gira)
        if (!concert.tour_name) {
          const tourName = extractTourName(ev.name, headlinerAttr.name);
          if (tourName) {
            await admin.from('concerts').update({ tour_name: tourName }).eq('id', concert.id);
            totals.tour_name_updated++;
          }
        }

        let matchedHeadliner = false;

        for (const cb of concert.concert_bands ?? []) {
          const band = cb.band;
          if (!band) continue;

          const attrForBand = attractions.find(
            (a) =>
              (!!band.ticketmaster_id && a.id === band.ticketmaster_id) ||
              normalizeName(a.name) === normalizeName(band.name),
          );

          // 2. musicbrainz_mbid (también lo necesita el fallback por gira)
          const attrMbid = attrForBand?.externalLinks?.musicbrainz?.[0]?.id ?? null;
          if (attrMbid && !band.musicbrainz_mbid) {
            await admin.from('bands').update({ musicbrainz_mbid: attrMbid }).eq('id', band.id);
            totals.mbid_updated++;
          }

          // 3. is_headliner (solo tiene sentido corregirlo si hay más de una banda)
          if (attractions.length < 2) continue;

          const isHeadlinerBand =
            (!!band.ticketmaster_id && band.ticketmaster_id === headlinerAttr.id) ||
            normalizeName(band.name) === normalizeName(headlinerAttr.name);

          if (isHeadlinerBand) matchedHeadliner = true;

          if (!!cb.is_headliner !== isHeadlinerBand) {
            await admin
              .from('concert_bands')
              .update({ is_headliner: isHeadlinerBand })
              .eq('concert_id', concert.id)
              .eq('band_id', cb.band_id);
            totals.headliner_updated++;
          } else {
            totals.headliner_unchanged++;
          }
        }

        if (attractions.length >= 2 && !matchedHeadliner) totals.headliner_unmatched++;

        await sleep(DELAY_MS);
      } catch (err) {
        console.warn(`Error concierto ${concert.id}:`, (err as Error).message);
        totals.errors++;
      }
    }

    return new Response(JSON.stringify(totals), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
