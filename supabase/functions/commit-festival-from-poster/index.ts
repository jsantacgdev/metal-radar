import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
};

// --- Geocoding ---

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

// --- Band resolver ---

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

// --- Upload cartel ---

async function uploadPosterImage(
  admin: any,
  festivalId: string,
  imageBase64: string,
  mediaType: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    // Nombre fijo: {festivalId}/festival.jpg (con upsert sobrescribe en re-subidas)
    const ext = mediaType.split('/')[1] ?? 'jpg';
    const fileName = `${festivalId}/festival.${ext}`;

    const binary = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    const { error: uploadErr } = await admin.storage.from(POSTERS_BUCKET).upload(fileName, binary, {
      contentType: mediaType,
      upsert: true, // sobrescribir si ya existe (re-subida)
    });

    if (uploadErr) return { publicUrl: null, error: uploadErr.message };

    const {
      data: { publicUrl },
    } = admin.storage.from(POSTERS_BUCKET).getPublicUrl(fileName);

    // Añadir query param para invalidar caché de RN/CDN cuando se sobrescribe
    const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;

    return { publicUrl: cacheBustedUrl, error: null };
  } catch (err) {
    return { publicUrl: null, error: (err as Error).message };
  }
}

// --- Handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = (await req.json()) as Payload;
    const { festival, bands, imageBase64, mediaType } = body;

    if (!festival?.name) {
      return new Response(JSON.stringify({ error: 'festival.name required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const results = {
      festival_id: null as string | null,
      venue_id: null as string | null,
      created_festival: false,
      created_venue: false,
      venue_geocoded: false,
      venue_geocode_strategy: null as 'venue' | 'city' | null,
      bands_added: 0,
      bands_created: 0,
      bands_reused: 0,
      bands_skipped: 0,
      skipped_details: [] as string[],
      image_url: null as string | null,
      image_upload_error: null as string | null,
    };

    // 1. VENUE
    let venueId: string;
    if (festival.venue.id) {
      venueId = festival.venue.id;
    } else {
      let lat = festival.venue.lat ?? 0;
      let lng = festival.venue.lng ?? 0;

      const needsGeocoding = !festival.venue.lat || !festival.venue.lng;
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
          name: festival.venue.name || 'TBD',
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
    }
    results.venue_id = venueId;

    // 2. FESTIVAL
    let festivalId: string;
    if (festival.id) {
      festivalId = festival.id;
      const updates: any = { venue_id: venueId };
      if (festival.start_date) updates.start_date = festival.start_date;
      if (festival.end_date) updates.end_date = festival.end_date;
      const { error: updErr } = await admin.from('festivals').update(updates).eq('id', festivalId);
      if (updErr) throw new Error(`Error actualizando festival: ${updErr.message}`);
    } else {
      const { data: newFest, error: festErr } = await admin
        .from('festivals')
        .insert({
          name: festival.name,
          start_date: festival.start_date,
          end_date: festival.end_date,
          venue_id: venueId,
        })
        .select('id')
        .single();
      if (festErr) throw new Error(`Error creando festival: ${festErr.message}`);
      festivalId = newFest.id;
      results.created_festival = true;
    }
    results.festival_id = festivalId;

    // 3. UPLOAD CARTEL
    if (imageBase64) {
      const uploaded = await uploadPosterImage(
        admin,
        festivalId,
        imageBase64,
        mediaType ?? 'image/jpeg',
      );
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

    // 4. BANDAS
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
