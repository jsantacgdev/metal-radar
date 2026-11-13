import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

function yearOf(date: string | null | undefined): number | null {
  const m = /^(\d{4})-/.exec(date ?? '');
  return m ? Number(m[1]) : null;
}

// Misma clave que parse-festival-poster: nombre normalizado sin el año.
function festivalKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOMINATIM_UA = 'MetalRadar/1.0 (https://metalradar.app)';
const POSTERS_BUCKET = 'festival-posters';

type Payload = {
  festival: {
    id: string | null;
    name: string;
    start_date: string | null;
    end_date: string | null;
    venue: {
      id: string | null;
      name: string | null;
      city: string | null;
      country: string | null;
      lat: number | null;
      lng: number | null;
    };
  };
  bands: {
    name: string;
    matched_band_id: string | null;
    tier: 'headliner' | 'subheadliner' | 'lineup';
  }[];
  imageBase64?: string;
  mediaType?: string;
  // Alternativa a imageBase64: URL pública del póster (propuestas automáticas
  // de refresh-festival-lineups). Se descarga y se guarda en el bucket.
  imageUrl?: string;
};

const MAX_POSTER_BYTES = 10 * 1024 * 1024;

async function downloadPoster(url: string): Promise<{ binary: Uint8Array; mediaType: string }> {
  if (!/^https:\/\//i.test(url)) throw new Error('imageUrl debe ser https');
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MetalRadar/1.0 (uso personal)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el póster`);
  const mediaType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(mediaType)) {
    throw new Error(`tipo de imagen no soportado: ${mediaType || 'desconocido'}`);
  }
  const binary = new Uint8Array(await res.arrayBuffer());
  if (binary.byteLength > MAX_POSTER_BYTES) throw new Error('póster demasiado grande (>10 MB)');
  return { binary, mediaType };
}

async function tryGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocodeVenue(
  venueName: string | null,
  city: string | null,
  country: string | null,
): Promise<{ lat: number; lng: number; strategy: 'venue' | 'city' } | null> {
  if (venueName && venueName !== 'TBD' && city) {
    const q1 = [venueName, city, country].filter(Boolean).join(', ');
    const r1 = await tryGeocode(q1);
    if (r1) return { ...r1, strategy: 'venue' };
    await sleep(1100);
  }
  if (city) {
    const q2 = [city, country].filter(Boolean).join(', ');
    const r2 = await tryGeocode(q2);
    if (r2) return { ...r2, strategy: 'city' };
  }
  return null;
}

async function resolveOrCreateBand(
  admin: any,
  name: string,
): Promise<{ bandId: string | null; created: boolean; error: string | null }> {
  const { data: existing } = await admin
    .from('bands')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  if (existing) return { bandId: existing.id, created: false, error: null };

  const { data: newBand, error: insertErr } = await admin
    .from('bands')
    .insert({ name, source: 'ocr' })
    .select('id')
    .single();
  if (!insertErr && newBand) return { bandId: newBand.id, created: true, error: null };

  const { data: retryExisting } = await admin
    .from('bands')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  if (retryExisting) return { bandId: retryExisting.id, created: false, error: null };

  return { bandId: null, created: false, error: insertErr?.message ?? 'unknown error' };
}

async function uploadPosterImage(
  admin: any,
  festivalId: string,
  binary: Uint8Array,
  mediaType: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    const ext = mediaType.split('/')[1] ?? 'jpg';
    const fileName = `${festivalId}/festival.${ext}`;

    const { error: uploadErr } = await admin.storage.from(POSTERS_BUCKET).upload(fileName, binary, {
      contentType: mediaType,
      upsert: true,
    });

    if (uploadErr) return { publicUrl: null, error: uploadErr.message };

    const {
      data: { publicUrl },
    } = admin.storage.from(POSTERS_BUCKET).getPublicUrl(fileName);

    const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;

    return { publicUrl: cacheBustedUrl, error: null };
  } catch (err) {
    return { publicUrl: null, error: (err as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // process-poster-inbox (carteles subidos desde el PC y revisados en
    // Supabase) llama con CRON_SECRET en vez de con un usuario.
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

      // Herramienta solo para admins: esto crea/edita festivales reales — no
      // basta con ocultar el botón en el cliente.
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

    const body = (await req.json()) as Payload;
    const { festival, bands, imageBase64, mediaType, imageUrl } = body;

    if (!festival?.name) {
      return new Response(JSON.stringify({ error: 'festival.name required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Protección: un cartel nunca actualiza una edición de otro año (antes un
    // cartel de 2027 podía sobrescribir el festival de 2026). Se comprueba antes
    // de tocar nada para no dejar un venue huérfano.
    if (festival.id) {
      const { data: current } = await admin
        .from('festivals')
        .select('start_date')
        .eq('id', festival.id)
        .maybeSingle();
      const currentYear = yearOf(current?.start_date);
      const newYear = yearOf(festival.start_date);
      if (currentYear != null && newYear != null && currentYear !== newYear) {
        return new Response(
          JSON.stringify({
            error: `El festival existente es la edición de ${currentYear} y el cartel es de ${newYear}: no se sobrescribe otra edición. Vuelve a analizar el cartel para crear la edición nueva.`,
          }),
          { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    }

    const results = {
      festival_id: null as string | null,
      venue_id: null as string | null,
      created_festival: false,
      created_venue: false,
      venue_geocoded: false,
      venue_has_coords: false,
      venue_geocode_strategy: null as 'venue' | 'city' | null,
      bands_added: 0,
      bands_created: 0,
      bands_reused: 0,
      bands_skipped: 0,
      skipped_details: [] as string[],
      image_url: null as string | null,
      image_upload_error: null as string | null,
    };

    let venueId: string;
    let venueReused = false;
    if (festival.venue.id) {
      venueId = festival.venue.id;
      venueReused = true;
    } else {
      const venueName = festival.venue.name || 'TBD';

      let existingVenue = null as { id: string } | null;
      if (festival.venue.city) {
        const { data } = await admin
          .from('venues')
          .select('id')
          .ilike('name', venueName)
          .ilike('city', festival.venue.city)
          .limit(1)
          .maybeSingle();
        existingVenue = data;
      }

      if (existingVenue) {
        venueId = existingVenue.id;
        venueReused = true;
      } else {
        let lat: number | null = festival.venue.lat ?? null;
        let lng: number | null = festival.venue.lng ?? null;

        const needsGeocoding = lat == null || lng == null;
        if (needsGeocoding) {
          const geo = await geocodeVenue(
            festival.venue.name,
            festival.venue.city,
            festival.venue.country,
          );
          if (geo) {
            lat = geo.lat;
            lng = geo.lng;
            results.venue_geocoded = true;
            results.venue_geocode_strategy = geo.strategy;
          }
        }

        const { data: newVenue, error: venueErr } = await admin
          .from('venues')
          .insert({
            name: venueName,
            city: festival.venue.city,
            country: festival.venue.country,
            lat,
            lng,
          })
          .select('id')
          .single();
        if (venueErr) throw new Error(`Error creando venue: ${venueErr.message}`);
        venueId = newVenue.id;
        results.created_venue = true;
        results.venue_has_coords = lat != null && lng != null;
      }
    }
    results.venue_id = venueId;

    // Un venue sin coordenadas deja el festival fuera del mapa. Si el reutilizado
    // no las tiene (p. ej. uno creado antes cuando falló la geocodificación), se
    // intenta geocodificar ahora en vez de arrastrarlo para siempre.
    if (venueReused) {
      const { data: venueRow } = await admin
        .from('venues')
        .select('name, city, country, lat, lng')
        .eq('id', venueId)
        .maybeSingle();
      results.venue_has_coords = venueRow?.lat != null && venueRow?.lng != null;
      if (venueRow && !results.venue_has_coords) {
        const geo = await geocodeVenue(venueRow.name, venueRow.city, venueRow.country);
        if (geo) {
          const { error: geoErr } = await admin
            .from('venues')
            .update({ lat: geo.lat, lng: geo.lng })
            .eq('id', venueId);
          if (!geoErr) {
            results.venue_has_coords = true;
            results.venue_geocoded = true;
            results.venue_geocode_strategy = geo.strategy;
          }
        }
      }
    }

    let festivalId: string;
    if (festival.id) {
      festivalId = festival.id;
      const updates: any = { venue_id: venueId };
      if (festival.start_date) updates.start_date = festival.start_date;
      if (festival.end_date) updates.end_date = festival.end_date;
      const { error: updErr } = await admin.from('festivals').update(updates).eq('id', festivalId);
      if (updErr) throw new Error(`Error actualizando festival: ${updErr.message}`);
    } else {
      // Edición nueva de un festival ya conocido: hereda de la edición anterior
      // lo que el cartel no trae (descripción, entradas, web oficial).
      const key = festivalKey(festival.name);
      const { data: allFestivals } = await admin
        .from('festivals')
        .select('name, start_date, description, ticket_url, official_url');
      const previous = (allFestivals ?? [])
        .filter((f: any) => {
          const k = festivalKey(f.name);
          return !!key && !!k && (k === key || k.includes(key) || key.includes(k));
        })
        .sort((a: any, b: any) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))[0];

      const { data: newFest, error: festErr } = await admin
        .from('festivals')
        .insert({
          name: festival.name,
          start_date: festival.start_date,
          end_date: festival.end_date,
          venue_id: venueId,
          description: previous?.description ?? null,
          ticket_url: previous?.ticket_url ?? null,
          official_url: previous?.official_url ?? null,
        })
        .select('id')
        .single();
      if (festErr) throw new Error(`Error creando festival: ${festErr.message}`);
      festivalId = newFest.id;
      results.created_festival = true;
    }
    results.festival_id = festivalId;

    let poster: { binary: Uint8Array; mediaType: string } | null = null;
    if (imageBase64) {
      poster = {
        binary: Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0)),
        mediaType: mediaType ?? 'image/jpeg',
      };
    } else if (imageUrl) {
      try {
        poster = await downloadPoster(imageUrl);
      } catch (err) {
        results.image_upload_error = (err as Error).message;
      }
    }

    if (poster) {
      const uploaded = await uploadPosterImage(admin, festivalId, poster.binary, poster.mediaType);
      if (uploaded.publicUrl) {
        await admin
          .from('festivals')
          .update({ image_url: uploaded.publicUrl })
          .eq('id', festivalId);
        results.image_url = uploaded.publicUrl;
      } else {
        results.image_upload_error = uploaded.error;
      }
    }

    const seenBandIds = new Set<string>();
    const rowsToInsert: { festival_id: string; band_id: string; is_headliner: boolean }[] = [];

    for (const b of bands) {
      let bandId = b.matched_band_id;

      if (!bandId) {
        const resolved = await resolveOrCreateBand(admin, b.name);
        if (!resolved.bandId) {
          results.bands_skipped++;
          results.skipped_details.push(`"${b.name}": ${resolved.error}`);
          continue;
        }
        bandId = resolved.bandId;
        if (resolved.created) results.bands_created++;
        else results.bands_reused++;
      }

      if (seenBandIds.has(bandId)) continue;
      seenBandIds.add(bandId);

      rowsToInsert.push({
        festival_id: festivalId,
        band_id: bandId,
        is_headliner: b.tier === 'headliner',
      });
    }

    if (rowsToInsert.length > 0) {
      const { error: fbErr } = await admin.from('festival_bands').upsert(rowsToInsert, {
        onConflict: 'festival_id,band_id',
        ignoreDuplicates: true,
      });
      if (fbErr) throw new Error(`Error insertando festival_bands: ${fbErr.message}`);
      results.bands_added = rowsToInsert.length;
    }

    return new Response(JSON.stringify(results), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
