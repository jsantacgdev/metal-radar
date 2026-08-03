# Metal Radar

Mobile app (Expo / React Native) for discovering metal concerts and festivals, following bands, keeping a personal gig diary, and generating a "wrapped"-style yearly recap. The backend runs on Supabase (Postgres + Auth + Storage + Edge Functions).

## Features

### Radar (band and concert discovery)

- **"For You"** tab: new band recommendations based on the ones you already follow (a carousel of highlights + an "emerging" list), each with an affinity percentage.
- **"My Bands"** tab: list of followed bands.
- Band search (debounced) to follow directly from the search results or open a band's detail page.
- Following a band automatically syncs its upcoming concerts (Ticketmaster) in the background — no button to press.
- Unfollowing a band asks for confirmation (with a "don't ask again" option).

### Map

- Concerts and festivals near your location (or your "home" reference location if GPS isn't available), calculated by real distance (haversine).
- Markers grouped by venue; tapping one opens a list of that venue's concerts/festivals with date, lineup, and a link to the detail screen.
- Configurable search radius; concerts outside the radius are shown separately ("far away").

### Band detail

- Bio, formation year, genre(s), country (with flag), popularity.
- Full lineup: members, active years, and who's currently in the band.
- Follow/unfollow button.

### Concert diary

- Personal log of concerts and festivals with status: interested / going / attended.
- Rating and notes per concert.
- Photo gallery per concert/festival (up to 10 photos), with upload and delete.
- Add the concert to the device's calendar (with reminders 24h and 9 min before).

### Setlists

- Automatic lookup of the concert's real setlist (via Setlist.fm) as soon as you mark it "going" or "attended".
- If the real setlist doesn't exist yet (future concert), a prediction based on the headliner's most recent known setlist from the same tour (or the artist's most recent one if Ticketmaster doesn't provide a tour name).
- Export the setlist as a Spotify playlist (requires connecting your Spotify account).

### Stats and yearly "Wrapped"

- Stats for the current year or all-time: number of concerts, festivals, distinct bands, distinct cities, km traveled (relative to your home location), top band and genre, best year.
- Drill-down detail for each stat (list of the concerts behind it).
- **"Wrapped" poster** (available November through January): generates a festival-poster-style image with your bands of the year sorted into tiers (headliners, special guests, etc.) based on times seen and popularity, ready to share.

### Festival poster import (internal tool)

- Hidden entry point (tap the profile footer 5 times).
- Upload a photo of a festival poster → an AI extracts the full lineup (festival name, dates, venue, bands) → an editable review screen (which bands already exist in the database vs. which will be created, with their billing tier) → confirmation, which creates/updates the festival, geocodes the venue, and stores the poster image.

### Notifications

- Push reminder the day before a concert you're attending.
- Configurable radius for alerts about new concerts near your location.
- Push notifications require a development/production build (they don't work in Expo Go).

### Account and settings

- Sign up/sign in with email and password (Supabase Auth).
- Initial onboarding: pick at least 3 bands to follow and enable notifications.
- Home location (used for the map, km stats, and nearby-concert notifications).
- Language switch (Spanish/English).
- Connect/disconnect Spotify.
- Manual on-demand concert sync.
- Account deletion with full data wipe (profile, followed bands, concerts, diary, photos).

## Tech stack

- **App**: Expo SDK 54, React Native, TypeScript (strict mode).
- **Navigation**: React Navigation (bottom tabs + native stacks).
- **Data**: TanStack Query + Supabase JS (Postgres, Auth, Storage).
- **Backend**: Supabase Edge Functions (Deno) — Ticketmaster sync, band enrichment (Last.fm, Spotify, MusicBrainz), setlists (Setlist.fm), push notifications, AI poster parsing.
- **Maps**: MapTiler / Leaflet (WebView).
- **i18n**: i18next / react-i18next (Spanish by default, English available).
- **Error monitoring**: Sentry (disabled in development, with PII scrubbing).

## Getting started

```bash
npm install
npm run start      # Expo dev server (Expo Go)
npm run android     # native Android build
npm run ios         # native iOS build
npm run web         # web version
npm run lint        # eslint
npx tsc --noEmit    # type-check
```

Required environment variables in `.env` (`EXPO_PUBLIC_*`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPTILER_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`, `EXPO_PUBLIC_CRON_SECRET`.

Edge Functions (`supabase/functions/*`) are deployed separately with the Supabase CLI (`supabase functions deploy <name>`) and use their own secrets (`SUPABASE_SERVICE_ROLE_KEY`, `TICKETMASTER_API_KEY`, `SETLISTFM_API_KEY`, etc.) configured in the Supabase project, not in `.env`.

## License

Copyright (c) 2026 jsantacgdev. All rights reserved. This software is proprietary — use, copying, modification, or distribution, commercial or not, is not permitted without the copyright holder's explicit written permission. See [LICENSE](LICENSE).
