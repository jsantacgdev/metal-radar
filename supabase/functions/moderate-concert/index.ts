import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

const NOMINATIM_UA = 'MetalRadar/1.0 (https://metalradar.app)';

type EditVenue = {
  id: string | null;
  name: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

type EditBand = { name: string; matched_band_id: string | null; is_headliner: boolean };

type Payload = {
  concert_id: string;
  action: 'delete' | 'dismiss' | 'edit';
  event_date?: string;
  event_time?: string | null;
  ticket_url?: string | null;
  venue?: EditVenue;
  bands?: EditBand[];
};

// Portado de submit-concert/index.ts (mismo patrón de duplicación entre
// Edge Functions ya usado en este proyecto — cada función es independiente).
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
  if (venueName && city) {
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

async function resolveOrCreateVenue(admin: any, venue: EditVenue): Promise<string> {
  if (venue.id) return venue.id;

  if (venue.city) {
    const { data: existing } = await admin
      .from('venues')
      .select('id')
      .ilike('name', venue.name)
      .ilike('city', venue.city)
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id;
  }

  let lat = venue.lat;
  let lng = venue.lng;

  if (lat == null || lng == null) {
    const geo = await geocodeVenue(venue.name, venue.city, venue.country);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  if (lat == null || lng == null) {
    throw new Error('venue_geocode_failed');
  }

  const { data: newVenue, error } = await admin
    .from('venues')
    .insert({ name: venue.name, city: venue.city, country: venue.country, lat, lng })
    .select('id')
    .single();
  if (error) throw new Error(`Error creando venue: ${error.message}`);

  return newVenue.id;
}

async function resolveOrCreateBand(admin: any, name: string): Promise<string | null> {
  const { data: existing } = await admin
    .from('bands')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: newBand, error: insertErr } = await admin
    .from('bands')
    .insert({ name, source: 'user_submitted' })
    .select('id')
    .single();
  if (!insertErr && newBand) return newBand.id;

  const { data: retryExisting } = await admin
    .from('bands')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  return retryExisting?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return unauthorized();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // No basta con ocultar el botón en el cliente — comprobar el rol aquí.
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Payload;
    if (!body.concert_id || (body.action !== 'delete' && body.action !== 'dismiss' && body.action !== 'edit')) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'dismiss') {
      const { error: updateErr } = await admin
        .from('concerts')
        .update({ report_count: 0 })
        .eq('id', body.concert_id);
      if (updateErr) throw updateErr;

      // Limpio: si el problema reaparece, cualquiera puede volver a reportarlo.
      const { error: deleteReportsErr } = await admin
        .from('concert_reports')
        .delete()
        .eq('concert_id', body.concert_id);
      if (deleteReportsErr) throw deleteReportsErr;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'edit') {
      if (!body.venue?.name || !body.event_date || !body.bands?.length) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      if (!body.bands.some((b) => b.is_headliner)) body.bands[0].is_headliner = true;

      const venueId = await resolveOrCreateVenue(admin, body.venue);

      const eventDate = body.event_time
        ? `${body.event_date}T${body.event_time}:00`
        : `${body.event_date}T00:00:00`;

      const { error: updateErr } = await admin
        .from('concerts')
        .update({
          venue_id: venueId,
          event_date: eventDate,
          ticket_url: body.ticket_url ?? null,
        })
        .eq('id', body.concert_id);
      if (updateErr) throw updateErr;

      const { error: cbDeleteErr } = await admin
        .from('concert_bands')
        .delete()
        .eq('concert_id', body.concert_id);
      if (cbDeleteErr) throw cbDeleteErr;

      const seenBandIds = new Set<string>();
      const rowsToInsert: { concert_id: string; band_id: string; is_headliner: boolean }[] = [];

      for (const b of body.bands) {
        const bandId = b.matched_band_id ?? (await resolveOrCreateBand(admin, b.name));
        if (!bandId || seenBandIds.has(bandId)) continue;
        seenBandIds.add(bandId);
        rowsToInsert.push({ concert_id: body.concert_id, band_id: bandId, is_headliner: b.is_headliner });
      }

      if (rowsToInsert.length > 0) {
        const { error: cbInsertErr } = await admin.from('concert_bands').insert(rowsToInsert);
        if (cbInsertErr) throw new Error(`Error insertando concert_bands: ${cbInsertErr.message}`);
      }

      // Corregir el concierto resuelve el motivo del reporte.
      const { error: reportCountErr } = await admin
        .from('concerts')
        .update({ report_count: 0 })
        .eq('id', body.concert_id);
      if (reportCountErr) throw reportCountErr;

      const { error: deleteReportsErr } = await admin
        .from('concert_reports')
        .delete()
        .eq('concert_id', body.concert_id);
      if (deleteReportsErr) throw deleteReportsErr;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // action === 'delete'
    // No confirmado que concert_bands/user_concerts tengan on delete cascade
    // hacia concerts, así que se borran explícitamente antes. concert_reports
    // sí tiene cascade (ver user-submitted-concerts.sql).
    const { error: cbErr } = await admin
      .from('concert_bands')
      .delete()
      .eq('concert_id', body.concert_id);
    if (cbErr) throw cbErr;

    const { error: ucErr } = await admin
      .from('user_concerts')
      .delete()
      .eq('concert_id', body.concert_id);
    if (ucErr) throw ucErr;

    const { error: concertErr } = await admin.from('concerts').delete().eq('id', body.concert_id);
    if (concertErr) throw concertErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
