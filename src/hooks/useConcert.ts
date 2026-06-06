import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ConcertDetail = {
  id: string;
  event_date: string;
  ticket_url: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  status: string;
  venue: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
    lat: number;
    lng: number;
  };
  bands: { id: string; name: string; image_url: string | null }[];
  userStatus: 'interested' | 'going' | 'attended' | null;
  userConcertId: string | null;
  rating: number | null;
  notes: string | null;
};

export function useConcert(concertId: string) {
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sin sesión');

      // Datos del concierto + venue + bandas
      const { data: concertData, error: cError } = await supabase
        .from('concerts')
        .select(
          `
          id, event_date, ticket_url, price_min, price_max, currency, status,
          venue:venues!inner ( id, name, city, country, lat, lng ),
          concert_bands ( band:bands ( id, name, image_url ) )
        `,
        )
        .eq('id', concertId)
        .single();

      if (cError) throw cError;

      // Estado del usuario respecto a este concierto
      const { data: ucData } = await supabase
        .from('user_concerts')
        .select('id, status, rating, notes')
        .eq('user_id', user.id)
        .eq('concert_id', concertId)
        .maybeSingle();

      const c: any = concertData;
      setConcert({
        id: c.id,
        event_date: c.event_date,
        ticket_url: c.ticket_url,
        price_min: c.price_min,
        price_max: c.price_max,
        currency: c.currency,
        status: c.status,
        venue: c.venue,
        bands: c.concert_bands.map((cb: any) => cb.band),
        userStatus: ucData?.status ?? null,
        userConcertId: ucData?.id ?? null,
        rating: ucData?.rating ?? null,
        notes: ucData?.notes ?? null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [concertId]);

  const updateStatus = async (status: 'interested' | 'going' | 'attended' | null) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (status === null) {
      // Quitar marca
      await supabase
        .from('user_concerts')
        .delete()
        .eq('user_id', user.id)
        .eq('concert_id', concertId);
    } else {
      await supabase
        .from('user_concerts')
        .upsert(
          { user_id: user.id, concert_id: concertId, status },
          { onConflict: 'user_id,concert_id' },
        );
    }
    await load();
  };

  return { concert, loading, error, updateStatus, reload: load };
}
