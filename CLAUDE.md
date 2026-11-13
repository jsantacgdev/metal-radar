# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Metal Radar — an Expo/React Native mobile app (iOS/Android/web) for discovering metal concerts and festivals, tracking a personal gig diary, and following bands. Frontend is Expo + TypeScript; backend is Supabase (Postgres + Auth + Storage + Edge Functions).

## Commands

```
npm run start          # expo start (dev server / Expo Go)
npm run android        # expo run:android
npm run ios            # expo run:ios
npm run web            # expo start --web
npm run lint           # expo lint (eslint-config-expo flat config)
npx tsc --noEmit        # type-check (no dedicated script; strict mode is on)
```

No test runner is configured in this repo.

Supabase Edge Functions live under `supabase/functions/*` and are deployed independently of the app (Deno runtime, not part of the Expo bundle/TS project). Use the Supabase CLI to serve/deploy them:

```
supabase functions serve <name>       # run one locally
supabase functions deploy <name>      # deploy one
```

Each function has its own `deno.json` import map and does not share `node_modules`/`tsconfig.json` with the app.

Two one-off admin scripts exist under `scripts/` (PowerShell, run manually against Supabase): `seed-bands.ps1`, `retro-fill-popularity.ps1`.

## Environment

App config is read from `EXPO_PUBLIC_*` vars (`.env`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPTILER_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`. Edge functions read their own secrets from `Deno.env` (service role key, Ticketmaster key, `CRON_SECRET`, etc.) — these are configured in the Supabase project, not `.env`. Never give a server secret an `EXPO_PUBLIC_` prefix: once referenced in app code it is inlined into the bundle/APK.

## Expo version note

This project is on **Expo SDK 54**, which has changed significantly from older SDKs/training-data assumptions. Always check `https://docs.expo.dev/versions/v54.0.0/` before relying on remembered Expo APIs.

## Architecture

### Navigation shell

`App.tsx` initializes Sentry, loads all custom fonts via `useFonts`, awaits `initI18n()`, then renders `RootNavigator` inside `QueryClientProvider` + `SafeAreaProvider`. `RootNavigator` (`src/navigation/RootNavigator.tsx`) branches on auth/onboarding state from `useAuth`: unauthenticated → `AuthNavigator`, authenticated-but-not-onboarded → `OnboardingScreen`, otherwise → `MainTabs`. `MainTabs` has five tabs, each backed by its own stack navigator: `RadarStack`, `MapStack`, `DiaryStack`, `FeedStack`, `ProfileStack`.

### Data layer

- `src/lib/supabase.ts` — single Supabase client, session persisted to `AsyncStorage`, PKCE auth flow.
- Data fetching goes through TanStack Query (`src/lib/queryClient.ts`) with one hook per resource under `src/hooks/` (e.g. `useDiary`, `useFestival`, `useNearbyConcerts`, `useFollowedBands`). Hooks call `supabase.from(...).select(...)` directly (nested relational selects, e.g. `concerts` → `venue` / `concert_bands` → `bands`) rather than going through a repository layer — read an existing hook before adding a new one to match the query-shape and error-handling conventions (throw on `.error`, translate "no session" via i18n).
- `src/lib/queryInvalidation.ts` centralizes which query keys to invalidate after a mutation touches user data (diary/profile stats/nearby concerts).
- Cross-cutting sync logic (`src/lib/sync.ts`) calls Edge Functions over `fetch` with the user's Supabase access token as a Bearer header, not the supabase-js RPC helpers.

### Core data model (Postgres, via Supabase)

`bands`, `venues`, `concerts` (concerts have a `concert_bands` join with `is_headliner`), `festivals` (parallel structure: `festival_bands`), `user_concerts` / `user_festivals` (per-user status: interested/going/attended, rating, notes, photo), plus setlists and diary photo storage. Concerts and festivals are structurally parallel but are separate tables/hooks throughout the app (not a shared polymorphic model) — expect to touch both sides when changing shared behavior (see `useDiary`'s `kind: 'concert' | 'festival'` merge pattern).

### Edge Functions (`supabase/functions/*`, Deno)

Each function is a standalone `Deno.serve` handler with CORS headers, a service-role Supabase client, and `verify_jwt = false` in `supabase/config.toml` (auth is checked manually inside the handler via the `Authorization` header instead of Supabase's built-in JWT gate). Notable groups:

- **Sync pipeline**: `sync-concerts` (pulls Ticketmaster events, geocodes venues via Nominatim, dedupes/filters tribute & VIP listings), `sync-band`, `cron-sync-all` (hourly pg_cron job; syncs a bounded batch of the stalest bands per run because Edge Functions get only 2s CPU per request — keep long loops bounded), `sync-ticketmaster-europe` (metal events in 18 European countries regardless of follows, paged per country). Every function that creates concerts must check `find_matching_concert` (SQL) first so the same show from different sources is stored once. (A Bandsintown scraper was tried and dropped on 2026-11-13: it returns 403 to Supabase's servers; don't work around it.) Schedules live in pg_cron (`cron.job`), not in `config.toml`.
- **Band enrichment**: `enrich-bands`, `cron-enrich-bands`, `prewarm-band-members`, `update-band-popularity`, `refresh-all-bands`, `seed-bands-by-genre`, `band-info`, `search-bands`, `recommend-bands`.
- **Festival poster ingestion**: `parse-festival-poster` (AI-parses an uploaded festival poster image into structured lineup data) → `commit-festival-from-poster` (writes the parsed result into `festivals`/`festival_bands`/`venues`); driven from `PosterAdminScreen` (hidden admin entry), or from the PC: posters dropped in the private `festival-posters-inbox` bucket are parsed by `process-poster-inbox` (cron) into `poster_imports` / `poster_import_bands` for review in the Supabase Table Editor, and committed once `status = 'approved'` (both functions also accept `CRON_SECRET` for these internal calls). Not to be confused with `PosterScreen` + `usePosterData`, which render the yearly "Wrapped" poster.
- **Social / moderation**: `report-concert`, `moderate-concert`, `submit-concert`, `report-comment`, `moderate-comment`, `moderate-user` (ban/unban), `notify-social` (push for social events + DMs, scheduled via pg_cron).
- **Notifications**: `notify-day-before`, `send-push`.
- **Account/misc**: `delete-account`, `fetch-setlist`.

### UI conventions

- Theme is centralized in `src/theme/` (`colors`, `typography`/`fontFamily`, `spacing`/`radius`) and re-exported from `src/theme/index.ts` — don't hardcode hex colors or font names in components. Dark theme only (`userInterfaceStyle: 'dark'`, `DarkTheme` from react-navigation).
- Shared primitives live in `src/components/ui/` (`Text`, `Button`, `Tag`, `Card`, `Divider`) and are the building blocks for screens; loading states use dedicated skeleton components in `src/components/skeletons/`.
- i18n via `i18next`/`react-i18next`; strings live in `src/i18n/locales/{en,es}.json` (Spanish is the default/fallback language) — use `t('namespace.key')`, don't hardcode user-facing strings.

### Error monitoring

Sentry (`@sentry/react-native`) is initialized in `App.tsx`, disabled in `__DEV__`, and scrubs PII (`ip_address`, `email`, `username`, fetch/xhr request/response bodies) before send. The authenticated user's Supabase `id` (only) is attached to Sentry scope on auth state changes.
