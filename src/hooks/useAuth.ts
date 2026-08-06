import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [bannedUntil, setBannedUntil] = useState<string | null>(null);

  const checkOnboarding = async (userId: string) => {
    try {
      const { count, error } = await supabase
        .from('user_bands')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      setHasOnboarded((count ?? 0) > 0);
    } catch (err) {
      console.warn('Error checking onboarding:', err);
      setHasOnboarded(false);
    }
  };

  const checkBanStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('banned_until')
        .eq('id', userId)
        .single();
      if (error) throw error;
      setBannedUntil(data?.banned_until ?? null);
    } catch (err) {
      console.warn('Error checking ban status:', err);
      setBannedUntil(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
      if (data.session) {
        checkOnboarding(data.session.user.id);
        checkBanStatus(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      if (s) {
        checkOnboarding(s.user.id);
        checkBanStatus(s.user.id);
      } else {
        setHasOnboarded(null);
        setBannedUntil(null);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshOnboarding = async () => {
    if (session) await checkOnboarding(session.user.id);
  };

  // banned_until = null → nunca baneado. Una fecha pasada significa que un
  // baneo temporal ya expiró (moderate-user no la limpia sola al expirar).
  const isBanned = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

  return { session, loading, hasOnboarded, isBanned, bannedUntil, refreshOnboarding };
}
