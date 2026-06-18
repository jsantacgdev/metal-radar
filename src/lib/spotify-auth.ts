import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'metalradar',
  path: 'spotify-callback',
});

console.log('[Spotify] REDIRECT_URI:', REDIRECT_URI);

const SCOPES = ['playlist-modify-public', 'playlist-modify-private'];

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
}

export async function isSpotifyLoggedIn(): Promise<boolean> {
  const tokens = await getStoredTokens();
  return !!tokens;
}

/**
 * Inicia el flujo OAuth con PKCE. Devuelve los tokens al terminar.
 */
export async function loginToSpotify(): Promise<StoredTokens> {
  console.log('[Spotify] REDIRECT_URI:', REDIRECT_URI);
  console.log('[Spotify] CLIENT_ID:', SPOTIFY_CLIENT_ID ? 'OK' : 'MISSING');

  // Generar PKCE
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  console.log('[Spotify] PKCE generado');

  const request = new AuthSession.AuthRequest({
    clientId: SPOTIFY_CLIENT_ID,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    codeChallenge: challenge,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    usePKCE: true,
  });

  console.log('[Spotify] Construyendo URL de auth...');
  await request.makeAuthUrlAsync(DISCOVERY);
  console.log('[Spotify] URL construida, abriendo navegador...');

  const result = await request.promptAsync(DISCOVERY);
  console.log('[Spotify] Resultado:', result.type, result);

  if (result.type !== 'success' || !result.params.code) {
    throw new Error(result.type === 'cancel' ? 'Cancelado' : 'Error en login');
  }

  // Intercambiar código por tokens
  const tokenResponse = await fetch(DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: result.params.code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
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

/**
 * Devuelve un access token válido, refrescándolo si hace falta.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens) return null;

  if (tokens.expiresAt > Date.now()) {
    return tokens.accessToken;
  }

  // Refresh
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
      // Token inválido, limpiar y forzar nuevo login
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

// PKCE helpers
async function generateCodeVerifier(): Promise<string> {
  const random = await Crypto.getRandomBytesAsync(32);
  return base64urlEncode(random);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
