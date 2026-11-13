# Metal Radar — Requisitos de APIs de terceros

_Última actualización: 2026-11-13_

Seguimiento vivo de los requisitos de uso (términos de servicio, límites, atribución, niveles de aprobación) de cada API externa de la que depende la app. Se actualiza cada vez que se resuelve, se verifica o se descubre un requisito — no es una foto fija de una auditoría puntual. Si un requisito cambia de estado, edita su casilla y añade una línea al historial al final del documento.

> **Alcance actual (desde el 2026-11-13): uso privado y no comercial**, para el autor y 3 o 4 amigos, sin publicar en Google Play. Con ese uso, los planes gratuitos o "no comerciales" de todos los proveedores bastan. La columna "Si se publicara" y el detalle por proveedor que sigue recogen lo que haría falta para una publicación comercial; se conservan por si algún día cambia el plan.

## Resumen

| Proveedor | Uso privado actual | Si se publicara (comercial) |
|---|---|---|
| Nominatim (OSM) | ✅ Uso ligero (User-Agent real y caché de venues desde 2026-11-13) | ⚠️ LocationIQ como seguro si crece el volumen |
| Setlist.fm | ✅ Key no comercial. La cláusula de retención aplica igual, pero el riesgo práctico es nulo | ❌ Retención de setlists incumple sus términos |
| Last.fm | ✅ Key gratuita (no comercial), atribución añadida | ⚠️ Uso comercial requiere acuerdo |
| MapTiler | ✅ Plan gratuito (no comercial) | ❌ Plan Flex ($25/mes) |
| Spotify | ✅ Modo desarrollo: añadir a mano a cada amigo en el dashboard | ❌ Extended Quota Mode |
| Ticketmaster | ✅ Discovery API gratuita (bandas seguidas + metal en 18 países europeos) | ⚠️ Requisito de marca sin verificar |
| Bandsintown | ⚠️ Lectura de su página pública (JSON-LD), sin API ni permiso: va contra sus condiciones. Uso personal a bajo volumen, se para si bloquean | ❌ Habría que pedir acceso a su API |
| MusicBrainz | ✅ API pública, no comercial | ⚠️ Posible tier Bronze |
| Anthropic (Claude) | ✅ Pago por uso | ✅ Sin cambios |
| Expo Push / Firebase | ⚠️ Verificar credencial FCM V1 en EAS (requisito técnico) | ⚠️ Igual |
| Sentry | ✅ Plan gratuito | ✅ Sin cambios |
| unpkg.com (CDN de maplibre-gl) | ⚠️ Nota de fiabilidad, no de cumplimiento | ⚠️ Igual |

## Detalle por proveedor

### Nominatim (OpenStreetMap)
**Uso:** geocodificación de venues — `sync-concerts`, `cron-sync-all`, `sync-band` (sincronización con Ticketmaster), `moderate-concert`, `submit-concert`, `commit-festival-from-poster` (venues manuales/de festival). Verificado el 2026-11-13: `band-info`, `prewarm-band-members` y `refresh-all-bands` ya no llaman a Nominatim.
**Nivel actual:** instancia pública gratuita, sin key.

- [x] User-Agent identificable con email de contacto real en todas las llamadas — corregido en código el 2026-08-04 (`sync-band` y `cron-sync-all` tenían un placeholder `tu@email.com`; el resto ya estaba bien), pero **no se desplegó hasta el 2026-11-13**: hasta entonces producción siguió enviando el placeholder.
- [x] Caché de coordenadas para no repetir geocodificaciones — **corregido el 2026-11-13**. Hasta entonces este punto estaba marcado como hecho, pero no era cierto en las tres funciones de sincronización: hacían un reverse geocode por cada concierto con coordenadas (para validar el país de Ticketmaster) antes de mirar si el venue ya existía, y como cada banda se resincroniza cada 12 h, los mismos venues se consultaban una y otra vez. Ahora cargan de `venues` los ya conocidos por `ticketmaster_id` y solo geocodifican los nuevos. Sus respuestas incluyen `venues_cached`/`venues_geocoded` para vigilar el volumen real. `moderate-concert`, `submit-concert` y `commit-festival-from-poster` ya consultaban `venues` antes de geocodificar.
- [ ] Límite de 1 req/seg — cada llamada va seguida de `sleep(1100)` y las llamadas de una misma ejecución son secuenciales, así que cada invocación respeta el límite (verificado 2026-11-13). No está garantizado en conjunto: si coinciden varias invocaciones (cron + usuarios siguiendo bandas), la suma puede superar 1 req/s. Con la caché el riesgo es bajo, porque solo los venues nuevos llegan a Nominatim.
- [ ] **Sin nivel de aprobación para uso comercial/público a volumen real** — la política de Nominatim pide autoalojarlo o usar un proveedor de pago por encima de uso ligero. No existe un "modo aprobado" al que solicitar acceso.

**Candidato de sustitución encontrado (2026-08-04, precios verificados):** **LocationIQ** — su plan gratuito (5.000 peticiones/día, 2 req/seg) **permite uso comercial explícitamente**, con la única condición de enlazar su atribución en la app (mismo patrón ya construido con `InfoTooltip` para Last.fm/Setlist.fm). Dado que Metal Radar solo geocodifica venues nuevos (los ya conocidos están cacheados en `venues`), es probable que el volumen real quede muy por debajo de 5.000/día. Si se superara, el primer escalón de pago es $49/mes (10.000 peticiones/día, 15 req/seg).

**Próxima acción:** con la caché corregida, la migración a LocationIQ deja de ser previa a publicar y pasa a ser un seguro: clave propia, condiciones comerciales explícitas y sin riesgo de bloqueo sin aviso. Vigilar `venues_geocoded` en las respuestas de `cron-sync-all`/`sync-concerts` y migrar si el volumen deja de ser "uso ligero" o si Nominatim empieza a fallar. Migrar consiste en cambiar `NOMINATIM_HEADERS` y las URLs de `nominatim.openstreetmap.org` en las 6 funciones afectadas, y añadir su atribución con `InfoTooltip`. Coste esperado: $0/mes salvo que el volumen supere el plan gratuito.

### Setlist.fm
**Uso:** `fetch-setlist` — setlists reales y predicción de setlist por gira.
**Nivel actual:** key gratuita (uso no comercial).

- [x] Enlace de atribución visible junto al setlist real — añadido 2026-08-04 (`src/components/Setlist.tsx`, tooltip "Source: setlist.fm" que enlaza a setlist.fm; solo aparece en el badge "SETLIST REAL", nunca en las predicciones de gira).
- [ ] **No retener setlists más allá de "periodos cortos" de caché** — la app los guarda de forma permanente en la tabla `setlists`. Es un incumplimiento real de sus términos, no un tema de cuota.

**Próxima acción:** decidir entre (a) pedir permiso por escrito a Setlist.fm para retención permanente, o (b) cambiar el modelo para no persistir el setlist completo. Sigue bloqueando publicar tal cual está hoy, la atribución solo resuelve una parte del problema.

### Last.fm (Audioscrobbler)
**Uso:** `band-info` — biografía de banda (`bio_es`/`bio_en`) y tags que se mezclan en `genres`. `enrich-bands` también trae `lastfm_listeners`/`lastfm_playcount`, que no se muestran en ningún sitio de la UI.
**Nivel actual:** key gratuita.

- [x] Crédito "Powered by AudioScrobbler" + enlace donde se muestran sus datos — añadido 2026-08-04 (`src/screens/BandDetailScreen.tsx`, tooltip junto al título "BIOGRAFÍA", el único campo 100% suyo; el de "ESTILO" mezcla Spotify/MusicBrainz/Last.fm y no lleva un crédito exclusivo).
- [ ] **Confirmar si el uso actual cuenta como "no comercial"** — su key gratuita es explícitamente solo para uso no comercial; uso comercial exige acuerdo firmado (`partners@last.fm`). No se ha determinado formalmente si Metal Radar (gratis, sin publicidad ni pagos hoy) entra en su definición de "no comercial".

**Próxima acción:** si en algún momento hay planes de monetización, contactar a Last.fm antes de lanzar. Con el modelo actual probablemente no bloquea, pero no está confirmado por escrito.

### MapTiler
**Uso:** mapa de conciertos/festivales cercanos (WebView + Leaflet).
**Nivel actual:** plan gratuito, key expuesta en cliente (`EXPO_PUBLIC_MAPTILER_KEY`).

- [ ] **Plan de pago para uso comercial** — el plan gratuito prohíbe explícitamente uso comercial; el más barato que sí lo permite es Flex: **$25/mes confirmado (2026-08-04)**, 500k peticiones/mes, $0,10 por cada 1.000 adicionales.
- [ ] Restringir la key por nombre de paquete en el dashboard de MapTiler (mitiga abuso de la key expuesta, independientemente del plan).

**Próxima acción:** contratar el plan Flex antes de publicar. No se puede resolver por código, requiere pago.

### Spotify Web API
**Uso:** enriquecimiento de bandas (Client Credentials), vinculación de cuenta de usuario y exportación de setlists a playlists (OAuth/PKCE).
**Nivel actual:** Development Mode (lista de usuarios autorizados).

- [ ] **Extended Quota Mode** — necesario para que cualquier usuario pueda vincular Spotify sin estar en la lista de autorizados. Spotify rechaza a la mayoría de solicitantes (según su propio blog de abril 2025).

**Próxima acción:** decidir entre solicitar Extended Quota Mode (con riesgo de rechazo) o mantener la vinculación de Spotify como función limitada mientras la app esté en Development Mode. No bloquea publicar la app en sí, pero sí que la función de Spotify funcione para el público general.

### Ticketmaster Discovery API
**Uso:** fuente principal de conciertos/eventos (`sync-concerts`, `cron-sync-all`, `sync-band`).
**Nivel actual:** key de servidor, tier "Discovery API" gratuito. (`EXPO_PUBLIC_TICKETMASTER_API_KEY` existía en `.env`/docs sin usarse en ningún sitio — retirada de la documentación el 2026-08-04.)

- [ ] **Verificar el requisito exacto de "cumplimiento de marca"** de sus términos — se detectó que existe esta exigencia pero no se profundizó en qué implica (¿logo?, ¿texto "powered by"?, ¿solo en documentación de desarrollador?). Pendiente de leer sus términos con detalle antes de dar esto por resuelto.
- [ ] Vigilar el límite de 5.000 llamadas/día y 5 req/seg bajo uso real — no hay alarma ni backoff explícito hoy si se supera.

**Próxima acción:** leer developer.ticketmaster.com/support/terms-of-use con calma y decidir si hace falta añadir atribución visible en la app.

Desde el 2026-11-13 también `sync-ticketmaster-europe`: clasificación `metal` en 18 países europeos, una página de 50 eventos cada 30 minutos (~50-150 llamadas al día, muy por debajo del límite). Cobertura medida ese día: Reino Unido ~528, Polonia ~140, Dinamarca ~53, Alemania ~47, España 4, Italia 2, Francia y Portugal 0. En el sur de Europa casi todo se vende por otras ticketeras sin API pública.

### Bandsintown
**Uso:** `sync-bandsintown` lee los conciertos en Europa de las bandas seguidas desde la página pública del artista (`bandsintown.com/a/<id>`, datos estructurados schema.org `MusicEvent`). El id de artista se obtiene de MusicBrainz, sin usar su buscador.
**Nivel actual:** sin API ni permiso, por decisión del usuario (uso personal y no comercial).

- Su `robots.txt` (gestionado por Cloudflare) permite el rastreo general (`User-agent: * Allow: /`), con `Content-Signal: search=yes, ai-train=no` y una reserva expresa de derechos bajo el art. 4 de la Directiva (UE) 2019/790 (minería de textos y datos).
- Sus condiciones exigen aprobar cualquier uso de su API y restringen el uso de sus datos. No se pudieron leer completas (Cloudflare bloqueó la página de términos), pero leer su web de forma automatizada va casi seguro contra ellas.
- Medidas: volumen bajo (cada banda una vez al día, solo bandas seguidas), User-Agent identificable con contacto, y **parar si hay bloqueo** (403/429/503 o página de comprobación) sin esquivarlo.
- Alternativa limpia: pedir acceso a su API por email.

### MusicBrainz
**Uso:** metadatos canónicos de banda, relaciones de artistas (formación, miembros).
**Nivel actual:** API pública gratuita, sin key (solo User-Agent identificable).

- [x] User-Agent con contacto real y límite de 1 req/seg respetado.
- [ ] **Confirmar con MetaBrainz si el uso cuenta como "comercial"** — su definición de "comercial" incluye apps populares aunque no tengan monetización directa, y su tier de pago (Bronze) contempla ese caso.

**Precio confirmado (2026-08-04):** el tier Bronze de MetaBrainz es una aportación mensual de **$100–499/mes**, negociable directamente con ellos según el caso.

**Próxima acción:** email a MetaBrainz para confirmar si el uso actual (app gratuita, sin ingresos) requiere su tier de pago. Baja urgencia mientras el volumen sea bajo.

### Anthropic API (Claude)
**Uso:** `parse-festival-poster` — extracción de line-up desde fotos de carteles (herramienta admin, bajo volumen).

- [x] Sin requisitos pendientes — los términos comerciales de Anthropic permiten uso en producción por defecto, sin nivel de aprobación separado.

### Expo Push Notification service + Firebase Cloud Messaging
**Uso:** notificaciones push (día antes de concierto, alertas de cercanía, eventos sociales, mensaje nuevo).

- [x] Relay de Expo gratuito, sin aprobación necesaria, límite (600 req/seg/proyecto) muy por encima del volumen esperado.
- [ ] **Confirmar que la credencial de servicio FCM V1** (Google retiró la API de key legacy) esté subida en el dashboard de EAS — no verificable desde el código, solo desde la cuenta de EAS.

**Próxima acción:** revisar en el dashboard de EAS (Credentials → Android → FCM) que la credencial V1 esté configurada; si no, el push en Android fallará en silencio.

### Sentry
**Uso:** monitorización de errores/crashes en producción.

- [x] Sin requisitos pendientes de cumplimiento — servicio SaaS por volumen de eventos, no por aprobación de uso.

### unpkg.com (CDN de maplibre-gl)
**Uso:** el WebView del mapa carga `maplibre-gl` JS/CSS en vivo desde unpkg en cada render.

- [ ] Nota de fiabilidad, no de cumplimiento: no hay versión empaquetada localmente ni fallback si unpkg falla. No bloquea publicación pero es un punto único de fallo para el mapa.

## Coste actual (uso privado)

Prácticamente cero: Supabase, Sentry, MapTiler, Last.fm, Setlist.fm, MusicBrainz, Ticketmaster y Spotify en sus planes gratuitos. El único gasto variable es Anthropic (Claude), por uso: hoy la lectura de carteles, y las automatizaciones de carteles y conciertos si se activan (unos pocos euros al mes).

## Coste estimado si se publicara (comercial)

Precios verificados el 2026-08-04. No incluye Apple (fuera de alcance, ver más abajo) ni gasto en marketing/ASO.

**Pago único**
| Concepto | Coste |
|---|---|
| Cuenta de desarrollador de Google Play | $25 (pago único, sin renovación; ahora exige verificación de identidad) |

**Recurrente**
| Concepto | Coste | Condición |
|---|---|---|
| MapTiler Flex | $25/mes (500k peticiones) | Obligatorio para uso comercial del mapa |
| LocationIQ (sustituto de Nominatim) | $0/mes probable; $49/mes si se supera el gratuito | Solo si se migra desde Nominatim (ver sección Nominatim) |
| MusicBrainz Bronze | $100–499/mes | Solo si MetaBrainz confirma que hace falta — no confirmado todavía |
| Supabase Pro | ~$25/mes base, $35–75/mes real con uso | Solo cuando el plan gratuito se quede corto de tráfico, no antes |

**Rango realista total:** desde ~$25 puntual + ~$25/mes (escenario mínimo, LocationIQ gratis cubre el volumen) hasta ~$25 puntual + ~$150/mes si además entra Supabase Pro y el primer escalón de LocationIQ. El escenario de MusicBrainz Bronze ($100–499/mes extra) es el menos probable a corto plazo.

Lo que no cuesta dinero pero sí tiempo: cambiar el modelo de retención de setlists (Setlist.fm), confirmar por email con Last.fm/MusicBrainz, decidir la estrategia de Spotify, y leer los términos de marca de Ticketmaster.

## Fuera de este documento

- No se publicará en Apple App Store por ahora — quedan fuera los requisitos específicos de Apple (Sign in with Apple, App Store Connect, export compliance, etc.). Si eso cambia, se documentarían aquí o en un fichero aparte.

## Historial

- **2026-11-13** — Nuevas fuentes de conciertos: Ticketmaster en 18 países europeos (`sync-ticketmaster-europe`) y Bandsintown (`sync-bandsintown`, lectura de su página pública sin permiso, uso personal, se para si bloquean). MusicBrainz pasa a usarse también para obtener el id de artista de Bandsintown.
- **2026-11-13** — Cambio de alcance: la app pasa a ser de uso privado y no comercial (autor + 3-4 amigos), sin publicar en Google Play. El resumen distingue entre el uso actual, cubierto por los planes gratuitos, y lo que haría falta si se publicara.
- **2026-11-13** — Nominatim: corregida la caché de venues en `sync-band`, `sync-concerts` y `cron-sync-all` (el punto "caché ya existente" era incorrecto). LocationIQ pasa de requisito previo a publicar a seguro opcional.
- **2026-11-13** — Desplegados `cron-sync-all` y `sync-band` con el User-Agent real de Nominatim (el arreglo del 2026-08-04 solo estaba en el repo). El resto de requisitos sigue sin cambios desde 2026-08-04; los precios no se han vuelto a verificar.
- **2026-08-04** — Verificados precios reales (Google Play $25 único, MapTiler Flex $25/mes, MusicBrainz Bronze $100–499/mes, Supabase Pro ~$25/mes base). Encontrado candidato de sustitución para Nominatim: LocationIQ, plan gratuito que permite uso comercial con atribución. Añadida sección de coste estimado.
- **2026-08-04** — Añadida atribución con enlace para Last.fm (`BandDetailScreen.tsx`) y Setlist.fm (`Setlist.tsx`) vía el nuevo componente `InfoTooltip`. Creado este documento.
- **2026-08-04** — Auditoría inicial de proveedores (bugs/calidad/Play Store). Corregido el User-Agent placeholder de Nominatim en `sync-band`/`cron-sync-all`. Retirada `EXPO_PUBLIC_TICKETMASTER_API_KEY` de la documentación por no usarse.
