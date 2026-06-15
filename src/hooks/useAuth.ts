import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      console.log('JWT:', data.session?.access_token);
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
      if (data.session) {
        checkOnboarding(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      if (s) {
        checkOnboarding(s.user.id);
      } else {
        setHasOnboarded(null);
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

  return { session, loading, hasOnboarded, refreshOnboarding };
}
