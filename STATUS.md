# Metal Radar — Estado del proyecto

_Última actualización: 2026-11-13_

## Estado actual

Metal Radar es una app móvil (Expo/React Native) con Google Play como objetivo de publicación más cercano (Apple queda fuera por ahora). El repositorio tiene ~145 commits. El desarrollo estuvo parado del 2026-08-07 (último commit, APK de release generado en local) al 2026-11-13, cuando se retomó.

Desde la revisión del 2026-08-04 se añadieron: avatar de perfil real, sanciones (baneo/suspensión) a usuarios reportados, y una forma de iniciar conversaciones nuevas desde Mensajes. Al retomar (2026-11-13) se hizo una puesta al día: se verificó que todos los scripts SQL de `supabase/scripts/` están aplicados en producción, se redesplegaron las 11 Edge Functions cuyo código en producción no coincidía con el repo (ahora las 26 coinciden), `npx tsc --noEmit` vuelve a pasar (excluye `supabase/functions`, que es Deno) y `npm run lint` queda sin avisos.

La app tiene un flujo de producto completo y navegable (onboarding → radar → mapa → diario → feed → perfil), con backend en Supabase en producción (proyecto ya linkado vía `supabase/.temp`). No hay suite de tests automatizados configurada; la validación se apoya en `tsc --noEmit`, ESLint y pruebas manuales. Ver "Preparación para publicación" para lo que sigue pendiente antes de subir a Play Console.

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
- Póster "Wrapped": imagen estilo cartel de festival con las bandas del año repartidas en niveles (headliner, invitado especial, etc.), lista para compartir. Pensado para nov–ene, pero **hoy el banner del diario se muestra todo el año** (`isPosterAvailable()` existe en `src/lib/wrappedAvailability.ts` pero no se aplica). Además, en enero el banner usaría el año nuevo mientras `PosterScreen` genera el del año anterior (`getPosterYear`). Decisión (2026-11-13): se deja así durante el desarrollo y se corrige al pasar a producción, activando el filtro nov–ene y usando `getPosterYear()` también en el banner.

### Importación de cartel de festival (herramienta interna/admin)
- Punto de entrada oculto (5 taps en el pie del perfil).
- Sube una foto de un cartel → IA extrae el line-up completo (nombre, fechas, venue, bandas) → pantalla de revisión editable (bandas existentes vs. nuevas, con su nivel de cartel) → confirmación que crea/actualiza el festival, geocodifica el venue y guarda la imagen del póster.

### Interacción social
- Usuario único (`username`) y seguimiento entre usuarios (solicitud pendiente/aceptada), con cuentas públicas o privadas y búsqueda de usuarios.
- Perfil público de otros usuarios.
- Diario visible para seguidores aceptados (según privacidad de la cuenta).
- "Quién va" a un concierto/festival, acotado a los usuarios que sigues.
- Feed de actividad (pestaña "Feed" en la navegación principal).
- Comentarios con un nivel de respuestas anidadas y likes por comentario, más valoración media pública de cada concierto/festival.
- Visibilidad por comentario (público o solo seguidores) — el autor elige al publicar; por defecto público, salvo los posts de estado (ver siguiente punto), que nacen en solo-seguidores.
- Posts de "estado" de logística dentro de los comentarios de un concierto/festival: "voy solo/a", "tengo hueco en el coche", "busco quien me lleve" — mismo hilo/likes/reporte que un comentario normal.
- Mensajes privados 1:1, solo entre usuarios ya conectados (que se siguen en algún sentido) — sondeo periódico, sin Supabase Realtime, con aviso push de mensaje nuevo vía `notify-social`. Se puede iniciar una conversación nueva desde la lista de mensajes (`NewMessageScreen`), que muestra el username en vez del email.
- Avatar de perfil real (subida a Storage, bucket `avatars`), mostrado en todas las listas de usuarios.
- Bloqueo de usuarios, aplicado en seguimiento, búsqueda, visibilidad de perfil, comentarios y mensajes privados.
- Reporte de usuarios (no solo de contenido puntual), accesible desde el menú de un comentario y desde el chat privado.
- Notificaciones push de eventos sociales (solicitud de seguimiento, nuevo seguidor, respuesta a comentario, mensaje nuevo), vía la función `notify-social` programada con pg_cron nativo de Supabase; protegida contra ejecuciones solapadas y con reintento real de los envíos de push que fallan a mitad.

### Moderación
- Reporte de conciertos, comentarios y usuarios, con pantalla de moderación de tres pestañas (Conciertos / Comentarios / Usuarios) para revisar/gestionar los tres tipos de reporte.
- Sanciones a usuarios reportados: baneo de 24h, 7 días o permanente, y desbaneo (`moderate-user`), con pestaña de usuarios baneados. El baneo corta también una sesión ya abierta: `profiles.banned_until` se comprueba en el cliente (`useAuth`) y muestra `BannedScreen`.

### Notificaciones
- Aviso push el día antes de un concierto marcado como "voy".
- Radio configurable para alertas de conciertos nuevos cerca de tu ubicación.
- Requieren build de desarrollo/producción (no funcionan en Expo Go).

### Cuenta y ajustes
- Alta/login con email y contraseña (Supabase Auth), nickname único y recuperación de contraseña ("olvidé mi contraseña").
- Onboarding inicial: nickname, seguir al menos 3 bandas y activar notificaciones.
- Ubicación "home" (usada en mapa, estadísticas de km y notificaciones de cercanía).
- Cambio de idioma (español/inglés).
- Conectar/desconectar Spotify.
- Sincronización manual de conciertos bajo demanda.
- Borrado de cuenta con purga completa de datos (perfil, bandas seguidas, conciertos, diario, fotos).

## Preparación para publicación (Google Play)

Auditoría hecha el 2026-08-04 (bugs, calidad de código, checklist de Play). Ya resuelto en código: RLS de mensajes privados, reporte/bloqueo extendido al chat, `eas.json` configurado para generar App Bundle y con el scaffold de `submit.production.android`.

Ya hecho en el backend (verificado el 2026-11-13):
- Scripts SQL aplicados en producción. Se comprobó por la API que existen las tablas y columnas de `add-cron-lock.sql`, `add-user-reports.sql`, `add-user-ban.sql` y `add-avatar-storage.sql`. `fix-direct-messages-update-grant.sql` solo cambia GRANTs y no se puede comprobar desde la API; se da por aplicado.
- Edge Functions en producción idénticas al repo, incluido el User-Agent real de Nominatim en `cron-sync-all`/`sync-band`.

Pendiente, todo fuera del código (ver detalle en la sección de abajo):

- Generar la clave de servicio de Play Console y colocarla en `./metal-radar-play-service-account.json` (raíz del repo; ya cubierta por el patrón `metal-radar-*.json` de `.gitignore`).
- Confirmar que la política de privacidad (enlazada desde Ajustes) esté realmente publicada, y darla de alta en Play Console (ficha + formulario Data Safety).
- Requisitos de proveedores externos (Nominatim, Setlist.fm, Last.fm, MapTiler, Spotify, Ticketmaster, MusicBrainz...) — seguimiento vivo en **[API_Terceros.md](API_Terceros.md)**, no duplicado aquí. Estado a 2026-11-13: atribución con enlace ya añadida para Last.fm y Setlist.fm; corregida la caché de venues, de modo que Nominatim solo recibe venues nuevos y migrar a LocationIQ pasa a ser opcional; siguen pendientes la retención de datos de Setlist.fm, el plan de pago de MapTiler y la aprobación de Spotify.

Pendiente en código antes de publicar:

- Wrapped: activar el filtro nov–ene y usar el año de `getPosterYear()` en el banner del diario (ver "Estadísticas y Wrapped anual"). Se dejó sin activar a propósito durante el desarrollo.
- Retención de setlists de Setlist.fm (ver [API_Terceros.md](API_Terceros.md)).

## Stack tecnológico

- **App**: Expo SDK 54, React Native 0.81, React 19, TypeScript en modo estricto. A 2026-11-13 la última SDK de Expo es la 58. El target de Android (API 36) cumple el requisito actual de Google Play, pero Expo Go de la tienda ya no abre proyectos SDK 54: se desarrolla con build nativa local (`npm run android`).
- **Navegación**: React Navigation (bottom tabs + native stacks) — shell en `RootNavigator` con 5 stacks (Radar, Mapa, Diario, Feed, Perfil).
- **Estado/datos**: TanStack Query v5 + `@supabase/supabase-js`, un hook por recurso en `src/hooks/`.
- **Backend**: Supabase (Postgres, Auth con PKCE, Storage, Edge Functions en Deno, `verify_jwt = false` con auth manual por header).
- **Mapas**: MapTiler + Leaflet embebido en WebView.
- **i18n**: i18next / react-i18next (español por defecto, inglés disponible), strings en `src/i18n/locales/{es,en}.json`.
- **Monitorización de errores**: Sentry (`@sentry/react-native`), deshabilitado en desarrollo, con scrubbing de PII (IP, email, username, cuerpos de request/response).
- **Tema**: tema oscuro único, centralizado en `src/theme/` (colores, tipografía, spacing), sin colores/fuentes hardcodeados en componentes.
- **Calidad**: ESLint (`eslint-config-expo` flat config) + Prettier; sin test runner configurado.
- **Build/distribución**: EAS (`eas.json`), bundle ids `com.metalradar.app` (iOS y Android), Google Services file y credencial Firebase Admin SDK presentes en el repo raíz (para push). Perfil `production` genera App Bundle para Android; `submit.production.android` ya apunta a la clave de servicio de Play (pendiente generarla, ver "Preparación para publicación"). El plugin `plugins/withApkName.js` da nombre al APK generado en local (`metal-radar-<versión>-release.apk`).

## APIs de terceros de las que dependemos

Estado de cara a un lanzamiento público con tráfico real revisado el 2026-08-04 — ver el detalle de qué falta en cada una en "Preparación para publicación" más arriba.

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
- **Pipeline de sincronización**: `sync-concerts`, `sync-band`, `cron-sync-all` (programado), `fix-concert-headliners`. `cron-sync-all` procesa en cada ejecución un lote acotado (máx. 10 bandas y sin empezar bandas nuevas pasados 90 s), empezando por las sincronizadas hace más tiempo. Antes del 2026-11-13 intentaba hacerlas todas en una sola llamada y moría con 546 `WORKER_RESOURCE_LIMIT` (límite de 2 s de CPU), perdiendo el push de conciertos nuevos. La respuesta incluye `bands_pending`: si deja de bajar a 0 entre ejecuciones, hay que subir la frecuencia o el tope. `sync-concerts` (sincronización manual desde Ajustes y desde el mapa) aplica lo mismo con un lote más corto (máx. 10 bandas, 60 s), porque hay un usuario esperando. Lo que no entra lo completa `cron-sync-all`, y Ajustes avisa de cuántas bandas quedan pendientes. Las dos pantallas usan `syncAllConcerts` (`src/lib/sync.ts`), que comprueba `res.ok`: antes, un 546 se mostraba como "Sincronización completada" con "Conciertos: undefined".
- **Enriquecimiento de bandas**: `enrich-bands`, `cron-enrich-bands`, `prewarm-band-members`, `update-band-popularity`, `refresh-all-bands`, `seed-bands-by-genre`, `band-info`, `search-bands`, `recommend-bands`.
- **Ingesta de carteles de festival**: `parse-festival-poster` (IA) → `commit-festival-from-poster`.
- **Conciertos manuales / moderación**: `submit-concert`, `report-concert`, `moderate-concert`.
- **Interacción social / moderación de comentarios y usuarios**: `report-comment`, `moderate-comment`, `moderate-user` (baneo/desbaneo), `notify-social`.
- **Notificaciones**: `notify-day-before`, `send-push`.
- **Cuenta**: `delete-account`.
- **Setlists**: `fetch-setlist`.

Cada función es independiente (`deno.json` propio, sin compartir `node_modules`/`tsconfig` con la app) y se despliega por separado con la Supabase CLI (`--use-api` evita necesitar Docker). Todas usan `verify_jwt = false` en `supabase/config.toml`. Las tareas programadas usan pg_cron nativo de Supabase (`net.http_post` a la función), visibles en el panel → Integrations → Cron o con `select jobname, schedule, active from cron.job`. A 2026-11-13: `notify-social-every-30-min`; `notify-day-before-daily` (10:00 UTC); `trigger_cron_sync_all_every_6h`, que pese al nombre se pasó a cada hora (`0 * * * *`) el 2026-11-13 para acompañar el lote acotado de `cron-sync-all`. `cron-enrich-bands` no aparecía en el historial reciente: falta comprobar si está programada. Solo `notify-social` tiene su script de programación en el repo (`supabase/scripts/schedule-notify-social.sql`). `cron.job_run_details` marca `succeeded` en cuanto se lanza la petición; el resultado real de la función se ve en Edge Functions → Invocations. Para comprobar que producción coincide con el repo: `supabase functions download --use-api --workdir <carpeta temporal>` y comparar (si no se usa `--workdir` en otra carpeta, sobrescribe `supabase/functions/`). Varias funciones (`enrich-bands`, `fetch-setlist`, `search-bands`, `update-band-popularity`, `parse-festival-poster`, `commit-festival-from-poster`) recibieron en julio de 2026 una revisión de seguridad que añadió verificación de auth manual dentro del handler.

### Scripts de administración (PowerShell, manuales) — `scripts/`
- `seed-bands.ps1` — siembra inicial de bandas.
- `retro-fill-popularity.ps1` — recálculo retroactivo de popularidad.
- `fix-concert-headliners.ps1` — corrección puntual de headliners.

### SQL auxiliar (manual, contra la base remota) — `supabase/scripts/`
- Interacción social: `add-username.sql`, `add-user-follows.sql`, `add-diary-visibility.sql`, `add-activity-feed.sql`, `add-comments-reactions.sql` (+ `undo-comments-reactions.sql`), `add-user-blocking.sql`, `add-social-push-notifications.sql`, `schedule-notify-social.sql`, `add-comment-visibility-and-status.sql`, `add-direct-messages.sql`.
- Seguridad: `fix-profile-role-escalation.sql` (escalada de rol en perfiles), `fix-direct-messages-update-grant.sql` (columnas editables en mensajes privados).
- Moderación: `add-user-reports.sql` (reporte de usuarios + arregla la política de lectura que le faltaba a `comment_reports`), `add-user-ban.sql` (`profiles.banned_until`, protegido contra auto-modificación).
- Perfil: `add-avatar-storage.sql` (`profiles.avatar_url`, bucket `avatars` con políticas por usuario, RPCs de listas de usuarios con avatar).
- Infraestructura: `add-cron-lock.sql` (evita que `notify-social` se solape consigo mismo).
- Datos: `festivals-2026.sql`.

### Otros
- **EAS Build** (`eas.json`) para builds nativas de desarrollo/producción.
- **Supabase CLI** linkado al proyecto remoto (`supabase/.temp/`).
