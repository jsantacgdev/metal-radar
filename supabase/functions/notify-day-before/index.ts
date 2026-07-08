import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Lang = 'es' | 'en';
const DEFAULT_LANG: Lang = 'es';

const I18N: Record<
  Lang,
  {
    title: (band: string) => string;
    body: (place: string) => string;
  }
> = {
  es: {
    title: (band) => `🤘 ¡Mañana toca ${band}!`,
    body: (place) => `No te lo pierdas en ${place}`,
  },
  en: {
    title: (band) => `🤘 ${band} plays tomorrow!`,
    body: (place) => `Don't miss it in ${place}`,
  },
};

type PushPayload = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
};

async function sendExpoPush(messages: PushPayload[]) {
  const chunks: PushPayload[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  const results: any[] = [];
  for (const chunk of chunks) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      console.warn(`Expo Push error: ${res.status}`);
      continue;
    }

    const data = await res.json();
    results.push(...(data.data ?? []));
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

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);

    console.log(
      `[notify-day-before] Buscando conciertos entre ${tomorrow.toISOString()} y ${dayAfterTomorrow.toISOString()}`,
    );

    const { data: userConcerts, error } = await admin
      .from('user_concerts')
      .select(
        `
        id,
        user_id,
        concert_id,
        status,
        concert:concerts!inner (
          id,
          event_date,
          venue:venues!inner ( name, city ),
          concert_bands ( is_headliner, band:bands ( name ) )
        )
      `,
      )
      .in('status', ['going', 'attended'])
      .gte('concert.event_date', tomorrow.toISOString())
      .lt('concert.event_date', dayAfterTomorrow.toISOString());

    if (error) throw error;

    if (!userConcerts || userConcerts.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No concerts tomorrow' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[notify-day-before] Encontrados ${userConcerts.length} conciertos a notificar`);

    const uniqueUserIds = Array.from(new Set(userConcerts.map((uc: any) => uc.user_id)));
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, push_token, language')
      .in('id', uniqueUserIds)
      .not('push_token', 'is', null);

    const userInfoMap = new Map<string, { push_token: string; language: Lang }>();
    for (const p of profiles ?? []) {
      const lang: Lang = (p as any).language === 'en' ? 'en' : 'es';
      if (p.push_token) {
        userInfoMap.set(p.id, { push_token: p.push_token, language: lang });
      }
    }

    const messages: PushPayload[] = [];
    for (const uc of userConcerts as any[]) {
      const userInfo = userInfoMap.get(uc.user_id);
      if (!userInfo) continue;

      const bands = uc.concert.concert_bands ?? [];
      const headlinerEntry = bands.find((cb: any) => cb.is_headliner) ?? bands[0];
      const bandName = headlinerEntry?.band?.name ?? '';
      if (!bandName) continue;

      const place = uc.concert.venue.city ?? uc.concert.venue.name;
      const dict = I18N[userInfo.language];

      messages.push({
        to: userInfo.push_token,
        title: dict.title(bandName),
        body: dict.body(place),
        data: { concertId: uc.concert.id, kind: 'day-before' },
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      });
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No users with push token' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = await sendExpoPush(messages);

    const invalidTokens: string[] = [];
    results.forEach((r: any, idx: number) => {
      if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(messages[idx].to);
      }
    });

    if (invalidTokens.length > 0) {
      await admin.from('profiles').update({ push_token: null }).in('push_token', invalidTokens);
      console.log(`[notify-day-before] Limpiados ${invalidTokens.length} tokens inválidos`);
    }

    return new Response(
      JSON.stringify({
        sent: messages.length,
        invalid_tokens: invalidTokens.length,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[notify-day-before] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
