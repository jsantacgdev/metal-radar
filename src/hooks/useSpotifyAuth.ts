import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getValidAccessToken, clearSpotifyAuth, loginToSpotify } from '../lib/spotify-auth';

export type SpotifyUser = {
  id: string;
  display_name: string;
  email?: string;
  image_url: string | null;
} | null;

async function fetchSpotifyUser(): Promise<SpotifyUser> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await clearSpotifyAuth();
    return null;
  }
  const data = await res.json();
  return {
    id: data.id,
    display_name: data.display_name,
    email: data.email,
    image_url: data.images?.[0]?.url ?? null,
  };
}

export function useSpotifyAuth() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['spotify-user'],
    queryFn: fetchSpotifyUser,
    staleTime: 5 * 60 * 1000,
  });

  const connect = async () => {
    await loginToSpotify();
    await queryClient.invalidateQueries({ queryKey: ['spotify-user'] });
  };

  const disconnect = async () => {
    await clearSpotifyAuth();
    queryClient.setQueryData(['spotify-user'], null);
  };

  return {
    user: query.data ?? null,
    isConnected: !!query.data,
    loading: query.isLoading,
    refetch: query.refetch,
    connect,
    disconnect,
  };
}
