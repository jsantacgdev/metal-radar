import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Lang = 'es' | 'en';
type SupportedLanguage = Lang;
const DEFAULT_LANG: Lang = 'es';

const I18N: Record<
  Lang,
  {
    title: (band: string) => string;
    body: (date: string, place: string) => string;
  }
> = {
  es: {
    title: (band) => `🤘 ${band}`,
    body: (date, place) => `Toca el ${date} en ${place}`,
  },
  en: {
    title: (band) => `🤘 ${band}`,
    body: (date, place) => `Playing on ${date} in ${place}`,
  },
};

function localeFor(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'es-ES';
}

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
    const body = await req.json();
    const concertIds: string[] = body.concertIds ?? [];

    if (concertIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No concert IDs' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const allPending: {
      user_id: string;
      concert_id: string;
      push_token: string;
      band_name: string;
      venue_name: string;
      venue_city: string;
      event_date: string;
    }[] = [];

    for (const concertId of concertIds) {
      const { data, error } = await admin.rpc('pending_notifications_for_concert', {
        p_concert_id: concertId,
      });

      if (error) {
        console.warn(`RPC error para ${concertId}:`, error.message);
        continue;
      }

      for (const row of data ?? []) {
        allPending.push({ ...row, concert_id: concertId });
      }
    }

    if (allPending.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No pending notifications' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const uniqueUserIds = Array.from(new Set(allPending.map((r) => r.user_id)));
    const { data: profilesData } = await admin
      .from('profiles')
      .select('id, language')
      .in('id', uniqueUserIds);

    const languageByUser = new Map<string, Lang>();
    for (const p of profilesData ?? []) {
      const lang = (p as any).language as SupportedLanguage | null;
      languageByUser.set(p.id, lang === 'en' ? 'en' : 'es');
    }

    const messages: PushPayload[] = allPending.map((row) => {
      const lang = languageByUser.get(row.user_id) ?? DEFAULT_LANG;
      const dict = I18N[lang];
      const date = new Date(row.event_date);
      const dateStr = date.toLocaleDateString(localeFor(lang), {
        day: 'numeric',
        month: 'short',
      });
      const place = row.venue_city ?? row.venue_name;

      return {
        to: row.push_token,
        title: dict.title(row.band_name),
        body: dict.body(dateStr, place),
        data: { concertId: row.concert_id },
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      };
    });

    const results = await sendExpoPush(messages);

    const sentRecords = allPending.map((row) => ({
      user_id: row.user_id,
      concert_id: row.concert_id,
    }));

    if (sentRecords.length > 0) {
      const { error: insertError } = await admin.from('notifications_sent').insert(sentRecords);

      if (insertError) {
        console.warn('Error guardando notifications_sent:', insertError.message);
      }
    }

    const invalidTokens: string[] = [];
    results.forEach((r: any, idx: number) => {
      if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(messages[idx].to);
      }
    });

    if (invalidTokens.length > 0) {
      await admin.from('profiles').update({ push_token: null }).in('push_token', invalidTokens);
      console.log(`Limpiados ${invalidTokens.length} tokens inválidos`);
    }

    return new Response(
      JSON.stringify({
        sent: allPending.length,
        invalid_tokens: invalidTokens.length,
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
