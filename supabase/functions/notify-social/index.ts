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
    followRequestTitle: (username: string) => string;
    followRequestBody: string;
    newFollowerTitle: (username: string) => string;
    newFollowerBody: string;
    replyTitle: (username: string) => string;
    messageTitle: (username: string) => string;
  }
> = {
  es: {
    followRequestTitle: (u) => `🤘 @${u} quiere seguirte`,
    followRequestBody: 'Toca para revisar la solicitud',
    newFollowerTitle: (u) => `🤘 @${u} te sigue ahora`,
    newFollowerBody: 'Nuevo seguidor en Metal Radar',
    replyTitle: (u) => `🤘 @${u} respondió a tu comentario`,
    messageTitle: (u) => `🤘 @${u} te ha escrito`,
  },
  en: {
    followRequestTitle: (u) => `🤘 @${u} wants to follow you`,
    followRequestBody: 'Tap to review the request',
    newFollowerTitle: (u) => `🤘 @${u} is now following you`,
    newFollowerBody: 'New follower on Metal Radar',
    replyTitle: (u) => `🤘 @${u} replied to your comment`,
    messageTitle: (u) => `🤘 @${u} sent you a message`,
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
    const now = new Date().toISOString();

    const [
      { data: pendingRequests, error: prErr },
      { data: newFollows, error: nfErr },
      { data: newReplies, error: nrErr },
      { data: newMessages, error: dmErr },
    ] = await Promise.all([
      admin
        .from('user_follows')
        .select(
          'follower_id, followee_id, follower:profiles!user_follows_follower_id_fkey ( username )',
        )
        .eq('status', 'pending')
        .is('request_notified_at', null),
      admin
        .from('user_follows')
        .select(
          'follower_id, followee_id, follower:profiles!user_follows_follower_id_fkey ( username )',
        )
        .eq('status', 'accepted')
        .is('accepted_notified_at', null),
      admin
        .from('comments')
        .select(
          `
            id, body, concert_id, festival_id, author_id,
            author:profiles!comments_author_id_fkey ( username ),
            parent:comments!comments_parent_comment_id_fkey ( author_id )
          `,
        )
        .not('parent_comment_id', 'is', null)
        .is('reply_notified_at', null),
      admin
        .from('direct_messages')
        .select('id, sender_id, recipient_id, sender:profiles!direct_messages_sender_id_fkey ( username )')
        .is('notified_at', null),
    ]);

    if (prErr) throw prErr;
    if (nfErr) throw nfErr;
    if (nrErr) throw nrErr;
    if (dmErr) throw dmErr;

    // recipientId -> evento a notificar
    type Event =
      | { kind: 'follow_request'; recipientId: string; username: string }
      | { kind: 'new_follower'; recipientId: string; username: string; followerId: string }
      | {
          kind: 'comment_reply';
          recipientId: string;
          username: string;
          concertId: string | null;
          festivalId: string | null;
        }
      | { kind: 'direct_message'; recipientId: string; username: string; senderId: string };

    const events: Event[] = [];

    for (const row of (pendingRequests ?? []) as any[]) {
      events.push({
        kind: 'follow_request',
        recipientId: row.followee_id,
        username: row.follower?.username ?? '',
      });
    }

    for (const row of (newFollows ?? []) as any[]) {
      events.push({
        kind: 'new_follower',
        recipientId: row.followee_id,
        username: row.follower?.username ?? '',
        followerId: row.follower_id,
      });
    }

    for (const row of (newReplies ?? []) as any[]) {
      // No notificar autorrespuestas (responder a tu propio comentario).
      if (row.parent?.author_id && row.parent.author_id !== row.author_id) {
        events.push({
          kind: 'comment_reply',
          recipientId: row.parent.author_id,
          username: row.author?.username ?? '',
          concertId: row.concert_id,
          festivalId: row.festival_id,
        });
      }
    }

    for (const row of (newMessages ?? []) as any[]) {
      events.push({
        kind: 'direct_message',
        recipientId: row.recipient_id,
        username: row.sender?.username ?? '',
        senderId: row.sender_id,
      });
    }

    if (events.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No social events pending' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const recipientIds = Array.from(new Set(events.map((e) => e.recipientId)));
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, push_token, language')
      .in('id', recipientIds)
      .not('push_token', 'is', null);

    const recipientInfo = new Map<string, { push_token: string; language: Lang }>();
    for (const p of profiles ?? []) {
      const lang: Lang = (p as any).language === 'en' ? 'en' : 'es';
      if (p.push_token) recipientInfo.set(p.id, { push_token: p.push_token, language: lang });
    }

    const messages: PushPayload[] = [];
    for (const event of events) {
      const info = recipientInfo.get(event.recipientId);
      if (!info) continue;
      const dict = I18N[info.language] ?? I18N[DEFAULT_LANG];

      if (event.kind === 'follow_request') {
        messages.push({
          to: info.push_token,
          title: dict.followRequestTitle(event.username),
          body: dict.followRequestBody,
          data: { kind: 'follow_request' },
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        });
      } else if (event.kind === 'new_follower') {
        messages.push({
          to: info.push_token,
          title: dict.newFollowerTitle(event.username),
          body: dict.newFollowerBody,
          data: { kind: 'new_follower', userId: event.followerId },
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        });
      } else if (event.kind === 'comment_reply') {
        messages.push({
          to: info.push_token,
          title: dict.replyTitle(event.username),
          body: '',
          data: {
            kind: 'comment_reply',
            concertId: event.concertId ?? undefined,
            festivalId: event.festivalId ?? undefined,
          },
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        });
      } else {
        messages.push({
          to: info.push_token,
          title: dict.messageTitle(event.username),
          body: '',
          data: { kind: 'direct_message', userId: event.senderId },
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        });
      }
    }

    const results = messages.length > 0 ? await sendExpoPush(messages) : [];

    // Marcar como procesado independientemente de si había push_token o
    // no — si el usuario no tiene notificaciones activas, reintentar en
    // cada ejecución no serviría de nada y solo repetiría trabajo.
    await Promise.all([
      ...(pendingRequests ?? []).map((row: any) =>
        admin
          .from('user_follows')
          .update({ request_notified_at: now })
          .eq('follower_id', row.follower_id)
          .eq('followee_id', row.followee_id),
      ),
      ...(newFollows ?? []).map((row: any) =>
        admin
          .from('user_follows')
          .update({ accepted_notified_at: now })
          .eq('follower_id', row.follower_id)
          .eq('followee_id', row.followee_id),
      ),
      (newReplies ?? []).length > 0
        ? admin
            .from('comments')
            .update({ reply_notified_at: now })
            .in(
              'id',
              (newReplies ?? []).map((row: any) => row.id),
            )
        : Promise.resolve(),
      (newMessages ?? []).length > 0
        ? admin
            .from('direct_messages')
            .update({ notified_at: now })
            .in(
              'id',
              (newMessages ?? []).map((row: any) => row.id),
            )
        : Promise.resolve(),
    ]);

    const invalidTokens: string[] = [];
    results.forEach((r: any, idx: number) => {
      if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(messages[idx].to);
      }
    });

    if (invalidTokens.length > 0) {
      await admin.from('profiles').update({ push_token: null }).in('push_token', invalidTokens);
    }

    return new Response(
      JSON.stringify({ sent: messages.length, events: events.length, invalid_tokens: invalidTokens.length }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[notify-social] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
