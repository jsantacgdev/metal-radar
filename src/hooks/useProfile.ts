import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { setLanguage, SupportedLanguage } from '../i18n';

export type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  home_lat: number | null;
  home_lng: number | null;
  search_radius_km: number;
  push_token: string | null;
  language: SupportedLanguage | null;
  role: 'user' | 'admin';
  is_private: boolean;
};

const USERNAME_FORMAT = /^[a-z0-9_]{3,20}$/;

async function fetchProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return data as Profile;
}

export function useProfile() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  const query = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  useEffect(() => {
    const profileLang = query.data?.language;
    if (profileLang && profileLang !== i18n.language) {
      setLanguage(profileLang).catch((err) =>
        console.warn('Error syncing language from profile:', err),
      );
    }
  }, [query.data?.language, i18n.language]);

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      if (!query.data) throw new Error(i18n.t('errors.profileNotLoaded'));
      const { error } = await supabase.from('profiles').update(patch).eq('id', query.data.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      queryClient.setQueryData<Profile | null>(['profile'], (old) =>
        old ? { ...old, ...patch } : old,
      );
    },
  });

  return {
    profile: query.data ?? null,
    loading: query.isLoading,
    update: (patch: Partial<Profile>) => updateMutation.mutateAsync(patch),
    reload: query.refetch,
  };
}

export type UsernameAvailability = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

export function useUsernameAvailability(username: string, currentUsername: string | null) {
  const [status, setStatus] = useState<UsernameAvailability>('idle');

  useEffect(() => {
    const candidate = username.trim().toLowerCase();

    if (!candidate) {
      setStatus('idle');
      return;
    }
    if (candidate === currentUsername?.toLowerCase()) {
      setStatus('idle');
      return;
    }
    if (!USERNAME_FORMAT.test(candidate)) {
      setStatus('invalid');
      return;
    }

    setStatus('checking');
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', candidate)
        .limit(1)
        .maybeSingle();

      if (error) {
        setStatus('error');
      } else {
        setStatus(data ? 'taken' : 'available');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, currentUsername]);

  return status;
}
