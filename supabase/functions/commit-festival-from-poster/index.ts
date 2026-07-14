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
  imageBase64: string,
  mediaType: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    const ext = mediaType.split('/')[1] ?? 'jpg';
    const fileName = `${festivalId}/festival.${ext}`;

    const binary = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

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
    if (!authHeader) throw new Error('Falta Authorization header');

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Usuario no autenticado');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Herramienta solo para admins: esto crea/edita festivales reales — no
    // basta con ocultar el botón en el cliente.
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

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

    let venueId: string;
    if (festival.venue.id) {
      venueId = festival.venue.id;
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
      }
    }
    results.venue_id = venueId;

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
