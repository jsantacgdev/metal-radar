import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TmEvent = {
  id: string;
  name: string;
  url: string;
  dates: { start: { dateTime?: string; localDate?: string } };
  priceRanges?: Array<{ min: number; max: number; currency: string }>;
  _embedded?: {
    venues?: Array<{
      id: string;
      name: string;
      city?: { name: string };
      country?: { name: string };
      location?: { latitude: string; longitude: string };
    }>;
    attractions?: Array<{ id: string; name: string }>;
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Cliente con permisos de usuario (para leer auth.uid())
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header');

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Usuario no autenticado');

    // Cliente con service_role para escribir saltando RLS
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Obtener bandas seguidas por el usuario
    const { data: userBands, error: ubError } = await admin
      .from('user_bands')
      .select('band_id, bands(id, name, spotify_id)')
      .eq('user_id', user.id);

    if (ubError) throw ubError;
    if (!userBands || userBands.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: 'No bands followed' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let totalConcerts = 0;

    // 2. Por cada banda, buscar conciertos en Ticketmaster
    for (const ub of userBands) {
      const band = (ub as any).bands;
      if (!band?.name) continue;

      const tmUrl = `https://app.ticketmaster.com/discovery/v2/events.json?` +
        `keyword=${encodeURIComponent(band.name)}` +
        `&classificationName=music` +
        `&size=20` +
        `&sort=date,asc` +
        `&apikey=${TICKETMASTER_API_KEY}`;

      const tmRes = await fetch(tmUrl);
      if (!tmRes.ok) {
        console.warn(`Ticketmaster error for ${band.name}: ${tmRes.status}`);
        continue;
      }

      const tmData = await tmRes.json();
      const events: TmEvent[] = tmData._embedded?.events ?? [];

      for (const ev of events) {
        const venue = ev._embedded?.venues?.[0];
        if (!venue || !venue.location) continue;

        const eventDate = ev.dates.start.dateTime ?? ev.dates.start.localDate;
        if (!eventDate) continue;

        // Upsert venue
        const { data: venueRow, error: venueError } = await admin
          .from('venues')
          .upsert({
            ticketmaster_id: venue.id,
            name: venue.name,
            city: venue.city?.name,
            country: venue.country?.name,
            lat: parseFloat(venue.location.latitude),
            lng: parseFloat(venue.location.longitude),
          }, { onConflict: 'ticketmaster_id' })
          .select('id')
          .single();

        if (venueError || !venueRow) {
          console.warn('Venue upsert error:', venueError?.message);
          continue;
        }

        // Upsert concert
        const priceRange = ev.priceRanges?.[0];
        const { data: concertRow, error: concertError } = await admin
          .from('concerts')
          .upsert({
            ticketmaster_id: ev.id,
            venue_id: venueRow.id,
            event_date: eventDate,
            ticket_url: ev.url,
            price_min: priceRange?.min ?? null,
            price_max: priceRange?.max ?? null,
            currency: priceRange?.currency ?? null,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'ticketmaster_id' })
          .select('id')
          .single();

        if (concertError || !concertRow) {
          console.warn('Concert upsert error:', concertError?.message);
          continue;
        }

        // Asociar banda al concierto
        await admin
          .from('concert_bands')
          .upsert({
            concert_id: concertRow.id,
            band_id: band.id,
            is_headliner: true,
          }, { onConflict: 'concert_id,band_id' });

        totalConcerts++;
      }
    }

    return new Response(
      JSON.stringify({ synced: totalConcerts, bands: userBands.length }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});