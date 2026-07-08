import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'metalradar',
  path: 'spotify-callback',
});

const SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'ugc-image-upload',
  'user-read-private',
  'user-read-email',
];

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

const STORAGE_KEY = 'spotify_auth_v1';

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

async function getStoredTokens(): Promise<StoredTokens | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveTokens(tokens: StoredTokens) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export async function clearSpotifyAuth() {
  await AsyncStorage.removeItem(STORAGE_KEY);
  try {
    await WebBrowser.coolDownAsync(); // cierra sesiones de browser embebido
  } catch {}
}

export async function isSpotifyLoggedIn(): Promise<boolean> {
  const tokens = await getStoredTokens();
  return !!tokens;
}

export async function loginToSpotify(): Promise<StoredTokens> {
  const request = new AuthSession.AuthRequest({
    clientId: SPOTIFY_CLIENT_ID,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });

  const result = await request.promptAsync(DISCOVERY);

  if (result.type !== 'success' || !result.params.code) {
    throw new Error(result.type === 'cancel' ? 'Cancelado' : 'Error en login');
  }

  const codeVerifier = request.codeVerifier;
  if (!codeVerifier) throw new Error('No se generó code_verifier');

  const tokenResponse = await fetch(DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: result.params.code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Token error: ${errText}`);
  }

  const data = await tokenResponse.json();

  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens) return null;

  if (tokens.expiresAt > Date.now()) {
    return tokens.accessToken;
  }

  try {
    const res = await fetch(DISCOVERY.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: SPOTIFY_CLIENT_ID,
      }).toString(),
    });

    if (!res.ok) {
      await clearSpotifyAuth();
      return null;
    }

    const data = await res.json();
    const newTokens: StoredTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    await saveTokens(newTokens);
    return newTokens.accessToken;
  } catch {
    return null;
  }
}
