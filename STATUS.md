# Metal Radar — Estado del proyecto

_Última actualización: 2026-11-13_

## Estado actual

Metal Radar es una app móvil (Expo/React Native) de **uso privado y sin fines comerciales**: para el autor y, como mucho, 3 o 4 amigos para organizarse para ir a conciertos. Desde el 2026-11-13 no se plantea publicarla en Google Play; se distribuye como APK (ver "Distribución"). El repositorio tiene ~145 commits. El desarrollo estuvo parado del 2026-08-07 (último commit, APK de release generado en local) al 2026-11-13, cuando se retomó.

Desde la revisión del 2026-08-04 se añadieron: avatar de perfil real, sanciones (baneo/suspensión) a usuarios reportados, y una forma de iniciar conversaciones nuevas desde Mensajes. Al retomar (2026-11-13) se hizo una puesta al día: se verificó que todos los scripts SQL de `supabase/scripts/` están aplicados en producción, se redesplegaron las 11 Edge Functions cuyo código en producción no coincidía con el repo (ahora las 26 coinciden), `npx tsc --noEmit` vuelve a pasar (excluye `supabase/functions`, que es Deno) y `npm run lint` queda sin avisos.

La app tiene un flujo de producto completo y navegable (onboarding → radar → mapa → diario → feed → perfil), con backend en Supabase en producción (proyecto ya linkado vía `supabase/.temp`). No hay suite de tests automatizados configurada; la validación se apoya en `tsc --noEmit`, ESLint y pruebas manuales.

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
- Póster "Wrapped": imagen estilo cartel de festival con las bandas del año repartidas en niveles (headliner, invitado especial, etc.), lista para compartir. Pensado para nov–ene, pero **hoy el banner del diario se muestra todo el año** (`isPosterAvailable()` existe en `src/lib/wrappedAvailability.ts` pero no se aplica). Además, en enero el banner usaría el año nuevo mientras `PosterScreen` genera el del año anterior (`getPosterYear`). Decisión (2026-11-13): se deja así de momento. Si se cambia, sería activando el filtro nov–ene y usando `getPosterYear()` también en el banner.

### Importación de cartel de festival (herramienta interna/admin)
- Punto de entrada oculto (5 taps en el pie del perfil).
- Sube una foto de un cartel → IA extrae el line-up completo (nombre, fechas, venue, bandas) → pantalla de revisión editable (bandas existentes vs. nuevas, con su nivel de cartel) → confirmación que crea/actualiza el festival, geocodifica el venue y guarda la imagen del póster.
- Ediciones por año (desde el 2026-11-13). El festival se empareja por nombre sin el año ("Resurrection Fest" = "Resurrection Fest 2026") y solo se actualiza si coincide el año; un cartel de otro año crea una edición nueva. Esa edición nueva hereda el venue, la descripción y las URLs de la anterior, y `commit-festival-from-poster` rechaza (409) actualizar una edición de otro año. Si el venue usado no tiene coordenadas, se geocodifica al guardar y, si no lo consigue, la revisión avisa de que el festival no saldrá en el mapa.
- Antes se emparejaba solo por nombre: el cartel de 2027 sobrescribió el Resurrection Fest 2026 (fechas, venue sin coordenadas, póster y bandas mezcladas). Se reparó con `supabase/scripts/fix-resurrection-2027-overwrite.sql` y se volvió a importar el cartel de 2027 como edición nueva.
- El OCR del cartel se equivoca con algunos nombres (p. ej. "Bilesa"/"Eblesa" por Kylesa): hay que revisar las bandas "a crear" antes de confirmar.

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

## Distribución (uso privado)

Desde el 2026-11-13 la app es de uso privado y no comercial, para el autor y unos pocos amigos. No se publica en Google Play. Por eso dejan de aplicar la cuenta de Play, la política de privacidad y el formulario Data Safety, la clave de servicio de Play y los planes de pago por uso comercial (MapTiler Flex, LocationIQ, MusicBrainz Bronze, Spotify Extended Quota). El análisis de proveedores para una publicación comercial se conserva en [API_Terceros.md](API_Terceros.md), por si algún día cambia.

- **Android:** APK de release generado en local (`npm run android` / Gradle; el plugin `withApkName` lo nombra `metal-radar-<versión>-release.apk`), instalado a mano permitiendo "orígenes desconocidos". El perfil `preview` de EAS también genera APK de distribución interna.
- **iPhone:** no se puede instalar sin cuenta de Apple Developer ($99/año). No está previsto.
- **Push en Android:** sigue haciendo falta la credencial FCM V1 en EAS (Credentials → Android → FCM). Requisito técnico, no de publicación.
- **Spotify:** en modo desarrollo; cada amigo que quiera vincular Spotify se añade a mano en el dashboard de la app de Spotify.

Ya hecho en el backend (verificado el 2026-11-13):
- Scripts SQL aplicados en producción. Se comprobó por la API que existen las tablas y columnas de `add-cron-lock.sql`, `add-user-reports.sql`, `add-user-ban.sql` y `add-avatar-storage.sql`. `fix-direct-messages-update-grant.sql` solo cambia GRANTs y no se puede comprobar desde la API; se da por aplicado.
- Edge Functions en producción idénticas al repo.

Decisiones abiertas (ya no bloquean nada):

- Wrapped: activar o no el filtro nov–ene y usar el año de `getPosterYear()` en el banner del diario (ver "Estadísticas y Wrapped anual").
- Retención de setlists de Setlist.fm: su cláusula de no guardarlos de forma permanente aplica sea o no comercial, pero con uso privado el riesgo práctico es nulo. Se deja como está.

## Stack tecnológico

- **App**: Expo SDK 54, React Native 0.81, React 19, TypeScript en modo estricto. A 2026-11-13 la última SDK de Expo es la 58. Expo Go de la tienda ya no abre proyectos SDK 54: se desarrolla con build nativa local (`npm run android`).
- **Navegación**: React Navigation (bottom tabs + native stacks) — shell en `RootNavigator` con 5 stacks (Radar, Mapa, Diario, Feed, Perfil).
- **Estado/datos**: TanStack Query v5 + `@supabase/supabase-js`, un hook por recurso en `src/hooks/`.
- **Backend**: Supabase (Postgres, Auth con PKCE, Storage, Edge Functions en Deno, `verify_jwt = false` con auth manual por header).
- **Mapas**: MapTiler + Leaflet embebido en WebView.
- **i18n**: i18next / react-i18next (español por defecto, inglés disponible), strings en `src/i18n/locales/{es,en}.json`.
- **Monitorización de errores**: Sentry (`@sentry/react-native`), deshabilitado en desarrollo, con scrubbing de PII (IP, email, username, cuerpos de request/response).
- **Tema**: tema oscuro único, centralizado en `src/theme/` (colores, tipografía, spacing), sin colores/fuentes hardcodeados en componentes.
- **Calidad**: ESLint (`eslint-config-expo` flat config) + Prettier; sin test runner configurado.
- **Build/distribución**: EAS (`eas.json`), bundle ids `com.metalradar.app` (iOS y Android), Google Services file y credencial Firebase Admin SDK presentes en el repo raíz (para push). El perfil `production` (App Bundle) y `submit.production.android` quedaron configurados para Play pero no se usan; la distribución es el APK (ver "Distribución"). El plugin `plugins/withApkName.js` da nombre al APK generado en local (`metal-radar-<versión>-release.apk`).

## APIs de terceros de las que dependemos

Con uso privado y no comercial, los planes gratuitos de todas cubren el uso actual. El detalle de requisitos, incluido lo que haría falta para una publicación comercial, está en [API_Terceros.md](API_Terceros.md).

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

Cada función es independiente (`deno.json` propio, sin compartir `node_modules`/`tsconfig` con la app) y se despliega por separado con la Supabase CLI (`--use-api` evita necesitar Docker). Todas usan `verify_jwt = false` en `supabase/config.toml`. Las tareas programadas usan pg_cron nativo de Supabase (`net.http_post` a la función), visibles en el panel → Integrations → Cron o con `select jobname, schedule, active from cron.job`. A 2026-11-13: `notify-social-every-30-min`; `notify-day-before-daily` (10:00 UTC); `trigger_cron_sync_all_every_6h`, que pese al nombre se pasó a cada hora (`0 * * * *`) el 2026-11-13 para acompañar el lote acotado de `cron-sync-all`. `cron-enrich-bands` nunca se había programado (se acumularon ~10.900 bandas sin foto); desde el 2026-11-13 se programa cada hora a los :30 con `supabase/scripts/schedule-cron-enrich-bands.sql`. Cada ejecución procesa como máximo 150 bandas o 90 s. Va primero por las bandas seguidas, luego las de carteles y conciertos, y después el resto. La respuesta incluye `priority` y `remaining`. Tienen script de programación en el repo `notify-social` y `cron-enrich-bands`. `cron.job_run_details` marca `succeeded` en cuanto se lanza la petición; el resultado real de la función se ve en Edge Functions → Invocations. Para comprobar que producción coincide con el repo: `supabase functions download --use-api --workdir <carpeta temporal>` y comparar (si no se usa `--workdir` en otra carpeta, sobrescribe `supabase/functions/`). Varias funciones (`enrich-bands`, `fetch-setlist`, `search-bands`, `update-band-popularity`, `parse-festival-poster`, `commit-festival-from-poster`) recibieron en julio de 2026 una revisión de seguridad que añadió verificación de auth manual dentro del handler.

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
