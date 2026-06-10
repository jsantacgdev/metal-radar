import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const NOMINATIM_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: tu@email.com)',
};

const TRIBUTE_KEYWORDS =
  /\b(tribute|tributo|homenaje|cover|vs\.?|versus|experience|story of|by candlelight|reimagined|symphonic)\b/i;

const VIP_KEYWORDS = /\b(vip packages?|paquetes? vip|hospitality|meet [&y] greet)\b/i;

const STALE_THRESHOLD_HOURS = 12;

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;

const HEAVY_GENRE_REGEX =
  /metal|rock|hardcore|punk|metalcore|deathcore|grunge|emo|screamo|thrash|doom|sludge|stoner|industrial|gothic|prog|alternative|nu.?metal|post.?punk|psychedelic|garage|indie/i;

const ENRICH_BATCH_SIZE = 80; // bandas por ejecución del cron
const SPOTIFY_DELAY_MS = 250;

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCountry(name?: string): string | null {
  if (!name) return null;
  return name.toLowerCase().trim();
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=3`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeCountry(data.address?.country);
  } catch {
    return null;
  }
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TmEvent = {
  id: string;
  name: string;
  url: string;
  dates: { start: { dateTime?: string; localDate?: string } };
  priceRanges?: { min: number; max: number; currency: string }[];
  _embedded?: {
    venues?: {
      id: string;
      name: string;
      city?: { name: string };
      country?: { name: string };
      location?: { latitude: string; longitude: string };
    }[];
    attractions?: {
      id: string;
      name: string;
      images?: { url: string }[];
    }[];
  };
};

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

async function searchSpotifyArtistEnrich(name: string, token: string) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    throw new Error(`SPOTIFY_RATE_LIMITED:${retryAfter}`);
  }
  if (!res.ok) return null;

  const data = await res.json();
  const items = data.artists?.items ?? [];
  const exact = items.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
  if (!exact) return null;

  return {
    spotify_id: exact.id,
    image_url: exact.images?.[0]?.url ?? null,
    genres: exact.genres ?? [],
  };
}

async function getLastfmTagsEnrich(artistName: string): Promise<string[]> {
  try {
    const url =
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags` +
      `&artist=${encodeURIComponent(artistName)}` +
      `&api_key=${LASTFM_API_KEY}` +
      `&format=json&autocorrect=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.toptags?.tag ?? []).slice(0, 5).map((t: any) => t.name.toLowerCase());
  } catch {
    return [];
  }
}

async function enrichBandsBatch(admin: any) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pending } = await admin
    .from('bands')
    .select('id, name, spotify_id, genres')
    .is('image_url', null)
    .or(`enrichment_attempted_at.is.null,enrichment_attempted_at.lt.${sevenDaysAgo}`)
    .limit(ENRICH_BATCH_SIZE);

  if (!pending || pending.length === 0) {
    return { total: 0, enriched: 0, not_found: 0, rejected_genre: 0, rate_limited: false };
  }

  let token: string;
  try {
    token = await getSpotifyToken();
  } catch (err) {
    console.warn('No Spotify token, skipping enrichment:', (err as Error).message);
    return {
      total: pending.length,
      enriched: 0,
      not_found: 0,
      rejected_genre: 0,
      rate_limited: true,
    };
  }

  const results = {
    total: pending.length,
    enriched: 0,
    not_found: 0,
    rejected_genre: 0,
    rate_limited: false,
  };

  for (const band of pending) {
    if (results.rate_limited) break;

    try {
      const spotifyData = await searchSpotifyArtistEnrich(band.name, token);

      if (!spotifyData) {
        await admin
          .from('bands')
          .update({
            enrichment_attempted_at: new Date().toISOString(),
            enrichment_found: false,
          })
          .eq('id', band.id);
        results.not_found++;
        await sleep(SPOTIFY_DELAY_MS);
        continue;
      }

      let finalGenres = spotifyData.genres;
      const spotifyIsHeavy =
        finalGenres.length > 0 && finalGenres.some((g: string) => HEAVY_GENRE_REGEX.test(g));

      if (!spotifyIsHeavy) {
        const lastfmTags = await getLastfmTagsEnrich(band.name);
        const allGenres = Array.from(new Set([...spotifyData.genres, ...lastfmTags]));
        const passesGenre = allGenres.some((g) => HEAVY_GENRE_REGEX.test(g));

        if (!passesGenre) {
          await admin
            .from('bands')
            .update({
              enrichment_attempted_at: new Date().toISOString(),
              enrichment_found: false,
              genres: allGenres,
            })
            .eq('id', band.id);
          results.rejected_genre++;
          await sleep(SPOTIFY_DELAY_MS);
          continue;
        }
        finalGenres = allGenres;
      }

      await admin
        .from('bands')
        .update({
          spotify_id: spotifyData.spotify_id,
          image_url: spotifyData.image_url,
          genres: finalGenres,
          enrichment_attempted_at: new Date().toISOString(),
          enrichment_found: true,
        })
        .eq('id', band.id);

      results.enriched++;
      await sleep(SPOTIFY_DELAY_MS);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith('SPOTIFY_RATE_LIMITED')) {
        console.warn(`Rate limited en enrichment: ${msg}`);
        results.rate_limited = true;
      }
    }
  }

  return results;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const staleSince = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    const { data: allBands, error: bandsError } = await admin
      .from('user_bands')
      .select('band:bands!inner(id, name, ticketmaster_id, last_concerts_sync_at)');

    if (bandsError) throw bandsError;

    const uniqueBands = new Map<
      string,
      {
        id: string;
        name: string;
        ticketmaster_id: string | null;
        last_concerts_sync_at: string | null;
      }
    >();
    for (const ub of allBands ?? []) {
      const b: any = (ub as any).band;
      if (b?.id && !uniqueBands.has(b.id)) {
        uniqueBands.set(b.id, b);
      }
    }

    let totalSynced = 0;
    let totalDiscarded = 0;
    let bandsSkipped = 0;
    let bandsProcessed = 0;

    for (const band of uniqueBands.values()) {
      if (band.last_concerts_sync_at && band.last_concerts_sync_at > staleSince) {
        bandsSkipped++;
        continue;
      }

      bandsProcessed++;

      try {
        let attractionId: string | null = band.ticketmaster_id;

        if (!attractionId) {
          const attrUrl =
            `https://app.ticketmaster.com/discovery/v2/attractions.json?` +
            `keyword=${encodeURIComponent(band.name)}` +
            `&classificationName=music&size=5` +
            `&apikey=${TICKETMASTER_API_KEY}`;

          const attrRes = await fetch(attrUrl);
          if (!attrRes.ok) continue;

          const attrData = await attrRes.json();
          const attractions = attrData._embedded?.attractions ?? [];

          const target = normalizeName(band.name);
          let matched = attractions.find((a: any) => normalizeName(a.name) === target);
          if (!matched) {
            matched = attractions.find((a: any) => {
              const candidate = normalizeName(a.name);
              return candidate.includes(target) || target.includes(candidate);
            });
          }

          if (!matched) {
            await admin
              .from('bands')
              .update({ last_concerts_sync_at: new Date().toISOString() })
              .eq('id', band.id);
            continue;
          }
          attractionId = matched.id;
          await admin.from('bands').update({ ticketmaster_id: attractionId }).eq('id', band.id);
        }

        const tmUrl =
          `https://app.ticketmaster.com/discovery/v2/events.json?` +
          `attractionId=${attractionId}` +
          `&size=20&sort=date,asc` +
          `&apikey=${TICKETMASTER_API_KEY}`;

        const tmRes = await fetch(tmUrl);
        if (!tmRes.ok) continue;

        const tmData = await tmRes.json();
        const events: TmEvent[] = tmData._embedded?.events ?? [];

        for (const ev of events) {
          if (TRIBUTE_KEYWORDS.test(ev.name) || VIP_KEYWORDS.test(ev.name)) {
            totalDiscarded++;
            continue;
          }

          const venue = ev._embedded?.venues?.[0];
          if (!venue) continue;

          const eventDate = ev.dates.start.dateTime ?? ev.dates.start.localDate;
          if (!eventDate) continue;

          const declaredCountry = normalizeCountry(venue.country?.name);
          let lat: number | null = venue.location ? parseFloat(venue.location.latitude) : null;
          let lng: number | null = venue.location ? parseFloat(venue.location.longitude) : null;

          let needsForwardGeocode = false;
          if (lat != null && lng != null && declaredCountry) {
            const realCountry = await reverseGeocode(lat, lng);
            await sleep(1100);
            if (realCountry && realCountry !== declaredCountry) {
              needsForwardGeocode = true;
            }
          } else if (lat == null || lng == null) {
            needsForwardGeocode = true;
          }

          if (needsForwardGeocode) {
            const query = [venue.name, venue.city?.name, venue.country?.name]
              .filter(Boolean)
              .join(', ');
            const geo = await forwardGeocode(query);
            await sleep(1100);
            if (!geo) {
              totalDiscarded++;
              continue;
            }
            lat = geo.lat;
            lng = geo.lng;
          }

          if (lat == null || lng == null) {
            totalDiscarded++;
            continue;
          }

          const { data: venueRow } = await admin
            .from('venues')
            .upsert(
              {
                ticketmaster_id: venue.id,
                name: venue.name,
                city: venue.city?.name,
                country: venue.country?.name,
                lat,
                lng,
              },
              { onConflict: 'ticketmaster_id' },
            )
            .select('id')
            .single();

          if (!venueRow) continue;

          const priceRange = ev.priceRanges?.[0];
          const { data: concertRow } = await admin
            .from('concerts')
            .upsert(
              {
                ticketmaster_id: ev.id,
                venue_id: venueRow.id,
                event_date: eventDate,
                ticket_url: ev.url,
                price_min: priceRange?.min ?? null,
                price_max: priceRange?.max ?? null,
                currency: priceRange?.currency ?? null,
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: 'ticketmaster_id' },
            )
            .select('id')
            .single();

          if (!concertRow) continue;

          // Guardar TODAS las attractions del evento como bandas del cartel
          const attractions = ev._embedded?.attractions ?? [];

          if (attractions.length === 0) {
            // Fallback: si no hay attractions, al menos asociamos la banda que sincronizamos
            await admin
              .from('concert_bands')
              .upsert(
                { concert_id: concertRow.id, band_id: band.id, is_headliner: true },
                { onConflict: 'concert_id,band_id' },
              );
          } else {
            for (let idx = 0; idx < attractions.length; idx++) {
              const attr = attractions[idx];
              if (!attr.name) continue;

              // Buscar o crear banda en BD
              const { data: existingBand } = await admin
                .from('bands')
                .select('id')
                .or(`ticketmaster_id.eq.${attr.id},name.ilike.${attr.name.replace(/,/g, '')}`)
                .limit(1)
                .maybeSingle();

              let bandIdInDb = existingBand?.id;

              if (!bandIdInDb) {
                const imageUrl = attr.images?.[0]?.url ?? null;
                const { data: newBand } = await admin
                  .from('bands')
                  .upsert(
                    {
                      name: attr.name,
                      ticketmaster_id: attr.id,
                      image_url: imageUrl,
                    },
                    { onConflict: 'ticketmaster_id' },
                  )
                  .select('id')
                  .single();
                bandIdInDb = newBand?.id;
              }

              if (bandIdInDb) {
                await admin.from('concert_bands').upsert(
                  {
                    concert_id: concertRow.id,
                    band_id: bandIdInDb,
                    is_headliner: idx === 0,
                  },
                  { onConflict: 'concert_id,band_id' },
                );
              }
            }
          }

          totalSynced++;
        }

        // Marcar la banda como sincronizada correctamente después de procesar todos sus eventos
        await admin
          .from('bands')
          .update({ last_concerts_sync_at: new Date().toISOString() })
          .eq('id', band.id);
      } catch (err) {
        console.warn(`Error processing band ${band.name}:`, err);
      }
    }

    let enrichResults = null;
    try {
      enrichResults = await enrichBandsBatch(admin);
    } catch (err) {
      console.warn('Enrichment phase failed:', (err as Error).message);
    }

    return new Response(
      JSON.stringify({
        synced: totalSynced,
        discarded: totalDiscarded,
        bands_total: uniqueBands.size,
        bands_processed: bandsProcessed,
        bands_skipped: bandsSkipped,
        enrichment: enrichResults,
        timestamp: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
