# Metal Radar — Estado del proyecto

_Última actualización: 2026-07-08_

## Estado actual

Metal Radar es una app móvil (Expo/React Native) en desarrollo activo, sin publicar aún en las stores. El repositorio tiene ~110 commits; el trabajo más reciente se ha centrado en el sistema de reporte de conciertos, corrección de géneros de banda y la funcionalidad de añadir conciertos manualmente. La app tiene ya un flujo de producto completo y navegable (onboarding → radar → mapa → diario → perfil), con backend en Supabase en producción (proyecto ya linkado vía `supabase/.temp`). No hay suite de tests automatizados configurada; la validación se apoya en `tsc --noEmit`, ESLint y pruebas manuales.

La rama de trabajo es `main` (sin otras ramas locales), con solo dos ficheros modificados sin commitear a fecha de hoy (`.claude/settings.json`, `CLAUDE.md`).

## Funcionalidades implementadas

### Radar (descubrimiento de bandas y conciertos)
- Pestaña "Para ti": recomendaciones de bandas nuevas basadas en las que ya sigues, con porcentaje de afinidad.
- Pestaña "Mis bandas": listado de bandas seguidas.
- Búsqueda de bandas (debounced) con follow directo o navegación a ficha de banda.
- Al seguir una banda se sincronizan en segundo plano sus próximos conciertos (Ticketmaster).

### Mapa
- Conciertos y festivales cercanos a la ubicación del usuario (o ubicación "home" de referencia), por distancia real (haversine).
- Marcadores agrupados por venue; radio de búsqueda configurable; conciertos fuera de radio se listan aparte.

### Ficha de banda
- Bio, año de formación, género(s), país (con bandera), popularidad.
- Line-up completo (miembros, años activos, quién sigue en la banda actualmente).

### Diario de conciertos
- Estado por concierto/festival: interesado / voy / asistí, con valoración y notas.
- Galería de fotos por concierto/festival (hasta 10), subida y borrado.
- Añadir el concierto al calendario del dispositivo con recordatorios (24h y 9 min antes).
- Añadir conciertos manualmente (fuera de Ticketmaster) y editarlos.

### Setlists
- Búsqueda automática del setlist real (Setlist.fm) al marcar "voy"/"asistí".
- Predicción de setlist basada en el último setlist conocido del cabeza de cartel (misma gira, o el más reciente si Ticketmaster no da nombre de gira).
- Exportación del setlist como playlist de Spotify (requiere cuenta conectada).

### Estadísticas y "Wrapped" anual
- Estadísticas del año en curso o históricas: nº de conciertos, festivales, bandas y ciudades distintas, km recorridos, banda/género top, mejor año.
- Detalle drill-down por estadística.
- Póster "Wrapped" (disponible nov–ene): imagen estilo cartel de festival con las bandas del año repartidas en niveles (headliner, invitado especial, etc.), lista para compartir.

### Importación de cartel de festival (herramienta interna/admin)
- Punto de entrada oculto (5 taps en el pie del perfil).
- Sube una foto de un cartel → IA extrae el line-up completo (nombre, fechas, venue, bandas) → pantalla de revisión editable (bandas existentes vs. nuevas, con su nivel de cartel) → confirmación que crea/actualiza el festival, geocodifica el venue y guarda la imagen del póster.

### Moderación
- Reporte de conciertos por parte de usuarios (motivo + detalle) y pantalla de moderación para revisar/gestionar reportes.

### Notificaciones
- Aviso push el día antes de un concierto marcado como "voy".
- Radio configurable para alertas de conciertos nuevos cerca de tu ubicación.
- Requieren build de desarrollo/producción (no funcionan en Expo Go).

### Cuenta y ajustes
- Alta/login con email y contraseña (Supabase Auth).
- Onboarding inicial: seguir al menos 3 bandas y activar notificaciones.
- Ubicación "home" (usada en mapa, estadísticas de km y notificaciones de cercanía).
- Cambio de idioma (español/inglés).
- Conectar/desconectar Spotify.
- Sincronización manual de conciertos bajo demanda.
- Borrado de cuenta con purga completa de datos (perfil, bandas seguidas, conciertos, diario, fotos).

## Stack tecnológico

- **App**: Expo SDK 54, React Native 0.81, React 19, TypeScript en modo estricto.
- **Navegación**: React Navigation (bottom tabs + native stacks) — shell en `RootNavigator` con 4 stacks (Radar, Mapa, Diario, Perfil).
- **Estado/datos**: TanStack Query v5 + `@supabase/supabase-js`, un hook por recurso en `src/hooks/`.
- **Backend**: Supabase (Postgres, Auth con PKCE, Storage, Edge Functions en Deno, `verify_jwt = false` con auth manual por header).
- **Mapas**: MapTiler + Leaflet embebido en WebView.
- **i18n**: i18next / react-i18next (español por defecto, inglés disponible), strings en `src/i18n/locales/{es,en}.json`.
- **Monitorización de errores**: Sentry (`@sentry/react-native`), deshabilitado en desarrollo, con scrubbing de PII (IP, email, username, cuerpos de request/response).
- **Tema**: tema oscuro único, centralizado en `src/theme/` (colores, tipografía, spacing), sin colores/fuentes hardcodeados en componentes.
- **Calidad**: ESLint (`eslint-config-expo` flat config) + Prettier; sin test runner configurado.
- **Build/distribución**: EAS (`eas.json`), bundle ids `com.metalradar.app` (iOS y Android), Google Services file y credencial Firebase Admin SDK presentes en el repo raíz (para push).

## APIs de terceros de las que dependemos

| API | Uso |
|---|---|
| **Ticketmaster Discovery API** | Fuente principal de conciertos/eventos (sincronización de bandas y conciertos cercanos). |
| **Setlist.fm** | Setlists reales y predicción de setlists futuros. |
| **Spotify Web API** (+ OAuth) | Enriquecimiento de bandas (imágenes, popularidad), conexión de cuenta de usuario, exportación de setlists como playlists. |
| **Last.fm (Audioscrobbler)** | Enriquecimiento de bandas: bio, tags/géneros, oyentes. |
| **MusicBrainz** | Enriquecimiento de bandas: metadatos canónicos, relaciones de artistas. |
| **Nominatim (OpenStreetMap)** | Geocodificación de venues (conciertos, festivales, sincronización y moderación). |
| **Anthropic API (Claude)** | Parseo por IA de fotos de carteles de festival (`parse-festival-poster`) para extraer line-up estructurado. |
| **Expo Push Notification service** (`exp.host`) | Envío de notificaciones push (día antes del concierto, alertas de cercanía). |
| **Firebase (Cloud Messaging)** | Transporte de push en Android (google-services.json + credencial Admin SDK en el repo). |
| **Sentry** | Recolección de errores/crashes de la app en producción. |

## Herramientas implementadas y utilizadas en el proyecto

### Edge Functions (Supabase, Deno) — `supabase/functions/*`
- **Pipeline de sincronización**: `sync-concerts`, `sync-band`, `cron-sync-all` (fan-out programado), `fix-concert-headliners`.
- **Enriquecimiento de bandas**: `enrich-bands`, `cron-enrich-bands`, `prewarm-band-members`, `update-band-popularity`, `refresh-all-bands`, `seed-bands-by-genre`, `band-info`, `search-bands`, `recommend-bands`.
- **Ingesta de carteles de festival**: `parse-festival-poster` (IA) → `commit-festival-from-poster`.
- **Conciertos manuales / moderación**: `submit-concert`, `report-concert`, `moderate-concert`.
- **Notificaciones**: `notify-day-before`, `send-push`.
- **Cuenta**: `delete-account`.
- **Setlists**: `fetch-setlist`.

Cada función es independiente (`deno.json` propio, sin compartir `node_modules`/`tsconfig` con la app) y se despliega por separado con la Supabase CLI. Hay funciones programadas (cron) definidas en `supabase/config.toml`: `cron-sync-all` y `cron-enrich-bands`.

### Scripts de administración (PowerShell, manuales) — `scripts/`
- `seed-bands.ps1` — siembra inicial de bandas.
- `retro-fill-popularity.ps1` — recálculo retroactivo de popularidad.
- `fix-concert-headliners.ps1` — corrección puntual de headliners.

### Otros
- **EAS Build** (`eas.json`) para builds nativas de desarrollo/producción.
- **Supabase CLI** linkado al proyecto remoto (`supabase/.temp/`), con SQL auxiliar en `supabase/scripts/festivals-2026.sql`.
