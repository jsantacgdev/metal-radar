import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  const checkOnboarding = async (userId: string) => {
    const { count, error } = await supabase
      .from('user_bands')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) {
      console.warn('Error checking onboarding:', error.message);
      setHasOnboarded(false);
      return;
    }
    setHasOnboarded((count ?? 0) > 0);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await checkOnboarding(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) await checkOnboarding(s.user.id);
      else setHasOnboarded(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const refreshOnboarding = async () => {
    if (session) await checkOnboarding(session.user.id);
  };

  return { session, loading, hasOnboarded, refreshOnboarding };
}