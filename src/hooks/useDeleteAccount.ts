import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

async function deleteAccount(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error('No active session');

  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error ?? 'Failed to delete account');
  }
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await supabase.auth.signOut();
    },
  });
}
