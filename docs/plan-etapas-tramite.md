# Plan: cronología completa (Manifestación → Mensura → Sentencia → Inscripción CBR) para todas las concesiones

> Este documento es el plan de trabajo para otra conversación de Claude Code. Contexto previo (sesión 2026-08-11): se implementó el stepper de etapa + grid de cronología en `/mapa` (commit `853f8a1`), se corrigió un bug de extracción de coordenadas azimut+distancia (commit `01249fd`), y se backfilleó/parseó manualmente el caso `FRANCISCA FERNANDA 1/30` (CVE 2789742 manifestación + CVE 2848521 mensura) como prueba de concepto end-to-end. Este plan generaliza ese proceso manual a todas las concesiones.

## Estado (sesión 2026-08-11, continuación — pasos A, B, C hechos)

- ✅ **Paso A — `expediente_key`**: commit `03425c0`. Migración aplicada, backfill corrido sobre las 3.643 filas existentes (0 sin key, 429 con clave fuerte, 3.536 expedientes distintos). `sync`/`parse-pdf`/`parse-batch`/`/api/boletin/concesion`/`MapClient.tsx` migrados. Verificado en navegador: `FRANCISCA FERNANDA 1/30` agrupa bien, y nombres duplicados reales (`ATENEA 1/10`, 2 titulares distintos) ya se desambiguan por `titular`.
- ✅ **Paso B — tabla `expedientes`**: commit `0555748`. Migración aplicada, `upsertExpediente()` en `src/lib/expedientes.ts`, wireado en `parse-pdf`/`parse-batch`. Backfill inicial: 3.536 expedientes materializados (`scripts/backfill-expedientes.mjs`). Bug encontrado y corregido en el camino: los campos planos (juzgado/causa_rol/inscripcion_fs/etc.) NO se mergean entre documentos — se toman solo del más reciente, igual que `MapClient.tsx` (mergearlos filtraba inscripciones de manifestaciones viejas y hacía creer que el expediente ya estaba en Inscripción CBR). **Pendiente**: `/api/boletin/concesion`/`MapClient.tsx` siguen leyendo en vivo (recalculando), todavía no leen de esta tabla — la migración de lectura queda para cuando se construya la sección 3 (Novedades).
- ✅ **Paso C — drenado automático**: commit `38162d2`. `.github/workflows/boletin-parse.yml`, cron 11:30 CLT (30 min después del sync), loop con tope conservador `limit=8 × max_iter=40` (~320 docs/día) para no drenar los ~3.300 pendientes de un saque. Probado en vivo contra producción (5 docs reales, `processed:5 success:5 errors:0`) — confirmado que `expediente_key` se promueve y `expedientes` se materializa correctamente end-to-end. **Desactivado manualmente en GitHub Actions el 2026-08-14** (`state: disabled_manually`, a pedido del usuario) — el `.yml` sigue en el repo con su `schedule` intacto, pero no corre solo hasta que alguien lo reactive (`gh workflow enable` o desde la pestaña Actions). Se puede seguir disparando a mano vía `workflow_dispatch` mientras tanto. El backlog de `pdf_parsed=false` no se drena mientras esté así, y `boletin-sync.yml` (que sí sigue activo) sigue metiendo filas nuevas sin parsear.
- ✅ **Extra no planeado, pedido durante la sesión**: cronología del modal `/mapa` ahora es clickeable — cada fecha (stepper + grilla) y los campos Juzgado/Causa ROL/Conservador/FS-N° abren, en pestaña nueva, el PDF específico del que salió ese dato (antes solo había un link genérico "Ver PDF" al documento más reciente). Commit `d0a6886`, `src/lib/etapaTramite.ts::mergeCronologiaConFuente()`.
- 🔍 **Paso E — integración PJUD (investigado, NO construido)**: se investigó (sin escribir código de producción) si se puede traer, por cada movimiento judicial de una causa, su documento individual — ver sección E más abajo. Conclusión: técnicamente posible pero requiere infraestructura nueva (navegador headless, no un simple `fetch`), y no se justificaba construirlo en la misma sesión sin que el usuario viera el tamaño real primero.
- 🔍 **Paso E.1 — propuesta con 3 opciones (2026-08-12, investigado, NO construido)**: investigación de mercado ante el pedido "poder revisar las causas de concesiones mineras". Confirmado que no hay fuente nueva que reemplace el boletín para Diario Oficial. Para PJUD apareció una opción nueva no evaluada antes (API paga de terceros, `boostr.cl`, $2.000 CLP/consulta) como alternativa a construir navegador headless propio — ver sección E.1 más abajo para el detalle y la recomendación (empezar por el botón "Ver en PJUD" gratis, validar la API paga con una prueba de $10.000 CLP antes de comprometer presupuesto mayor).
- 🔍 **Paso 2.F — notificaciones sobre favoritos (2026-08-12, propuesto, NO construido)**: pedido de notificar al usuario cuando hay un documento/movimiento nuevo en una concesión que marcó como favorita (`favoritos` ya existe), corriendo todos los días, con la escala como preocupación explícita. Diseño: reusa el trabajo caro que ya corre diario para el universo completo (sync + parse-batch, pasos A-C) — lo nuevo es solo una comparación barata acotada a los `expediente_key` distintos presentes en `favoritos` (no el universo total), más una tabla `notificaciones` y una campanita en el header. Ver sección 2.F para el diseño de 4 piezas y el orden sugerido.
- 🔍 **Paso E.2 — pipeline end-to-end de monitoreo de causas (2026-08-12, propuesto, NO construido)**: responde "cómo se resuelve monitorear causas para actualizar la BD y notificar" uniendo D+E+E.1+2.F en un solo circuito: detectar movimiento nuevo en PJUD (fuente/cadencia según lo que decida E.1) → guardarlo en `expediente_movimientos` (tabla nueva) y reflejar avance de etapa en `expedientes` → disparar notificación reusando la tabla/campanita de 2.F con un tercer tipo (`pjud_movimiento`). Orden correcto: decidir/validar fuente en E.1 primero, después construir este pipeline. Ver sección E.2.
- ⏳ **Pendiente**: paso D (backfill hacia atrás de manifestaciones faltantes) y sección 3 (vista "Novedades del boletín") — no empezados.

## 0. Corrección a la idea original

La idea de partida era *"petición HTTP simulada al Buscador del Diario Oficial, filtrando por categoría Minería, últimas 24h"*. **No hace falta construir eso**: `boletinoficialdemineria.cl` (lo que ya scrapea `src/app/api/boletin/sync/route.ts`) es un sitio dedicado exclusivamente a la Sección VII de minería — ya es 100% categoría minería por construcción, sin necesidad de filtrar nada, y es más simple/estable que el buscador genérico del Diario Oficial (que cubre las ~7 secciones del diario y no tiene garantía de no pedir CAPTCHA). **Reusar y extender el sync existente, no reemplazarlo.**

Lo que sí falta y es el foco real de este plan:
- **Tribunal (juzgado) y N° de ROL (causa_rol) no vienen en el listado del sync** — el sync solo trae nombre/titular/región/CVE/PDF. Esos dos campos que pide el usuario solo se obtienen parseando el PDF con el LLM (`parse-pdf`/`parse-batch`), que hoy corre manual y con backlog (~2000 filas `pdf_parsed=false` a la fecha de este documento).
- El sync ya corre diario vía GitHub Actions (`.github/workflows/boletin-sync.yml`, cron `0 15 * * *` = 11:00 CLT — cambiar a 08:00 CLT es un one-liner si se prefiere esa hora).

## 1. Gaps identificados esta sesión (por qué no alcanza con "correr el sync todos los días")

1. **`nombre` no es una clave confiable para agrupar un trámite.** Ya vimos en producción 5+ concesiones distintas llamadas "FERNANDA 10" (titulares y regiones distintas). El merge de cronología en `MapClient.tsx` hoy agrupa por `ilike(nombre)` — funciona para casos como `FRANCISCA FERNANDA 1/30` porque el nombre es poco común, pero a escala **va a mezclar cronologías de trámites distintos que comparten nombre**. Hay que resolver esto antes de automatizar el merge para todas las concesiones.
2. **`parse-batch` tiene techo de ~8-10 documentos por invocación** (confirmado hoy: `limit=10` dio `504 FUNCTION_INVOCATION_TIMEOUT` en Vercel, `maxDuration=60`). Con ~2000 filas de backlog, hace falta un mecanismo que drene la cola en muchas invocaciones chicas, no una sola grande.
3. **La etapa "Manifestación" muchas veces está fuera de la ventana de sync** cuando recién se detecta el trámite en una etapa posterior (mensura/sentencia) — pasó exactamente con `FRANCISCA FERNANDA 1/30`: la manifestación se publicó 2026-04-01, la mensura 2026-08-05, y sin el backfill manual de hoy nunca se habría encontrado (no hay buscador por nombre en el sitio fuente, solo navegación por fecha).
4. **No hay vista de "qué cambió"** — para que el usuario pueda ir revisando trámite por trámite a medida que avanzan de etapa, hace falta materializar el estado (no recalcularlo solo al abrir el modal de una concesión puntual).

## 2. Arquitectura propuesta (4 piezas, en orden de implementación)

### A. Clave de agrupación estable por expediente (hacer primero — todo lo demás depende de esto) — ✅ HECHO (commit `03425c0`)

- Agregar columna `expediente_key` a `boletin_publicaciones` (o tabla nueva `expedientes`).
- Una vez parseado un documento (`causa_rol` + `juzgado` ya extraídos), esa combinación es la clave fuerte — es único por causa judicial en Chile.
- Para filas sin parsear todavía, usar un fallback débil: `slugify(nombre) + slugify(titular) + region` — suficiente para no perder el hilo mientras se espera el parse, pero se re-concilia con la clave fuerte apenas el parse corre.
- Migrar `/api/boletin/concesion` (y el merge de `MapClient.tsx`) para agrupar por `expediente_key` en vez de `ilike(nombre)`.

### B. Materializar tabla `expedientes` (estado consolidado por trámite) — ✅ HECHO (commit `0555748`)

Una fila por `expediente_key` con:
- `nombre`, `titular`, `juzgado`, `causa_rol`, `region`, `comuna`
- las 9 fechas de cronología (merge ya resuelto, no recalculado en cada request)
- `etapa_actual` (manifestación/mensura/sentencia/inscripción — mismo cálculo que `etapaActualIdx` en `MapClient.tsx`, pero server-side y persistido)
- `etapa_anterior` + `etapa_cambiada_at` — para poder mostrar "qué avanzó desde ayer"
- `revisado_at` (nullable) — el usuario marca como revisado cuando ya lo validó

`parse-pdf`/`parse-batch` hacen upsert en esta tabla además de actualizar la fila de `boletin_publicaciones` (igual que hoy mergean `doc`, pero ahora el merge se guarda consolidado, no recalculado client-side cada vez).

### C. Automatizar lo que hoy es manual (sync diario + drenado de parse) — ✅ HECHO (commit `38162d2`)

Confirmado en código (sesión 2026-08-11 cont.): `boletin-sync.yml` **solo** llama a `/api/boletin/sync` — nunca a `parse-pdf`/`parse-batch`. El parseo de PDF hoy es 100% manual (alguien pega la URL a mano o corre un script). Backlog real al momento de escribir esto: **3.308 de 3.643 filas `pdf_parsed=false`** (creció desde el ~2000 estimado el día anterior — sigue sin drenarse mientras el sync diario sigue metiendo filas nuevas).

**Ojo — hay dos parsers, no uno, y comparten un flag:**
- `scripts/parse-boletin-pdfs.py` — regex + `pdfplumber`, local, gratis, sin LLM. Extrae `causa_rol`/`juzgado`/`comuna`/coordenadas/`inscripcion_fs`, pero **no extrae la cronología** (`manifestacion_publicacion`, `mensura_solicitud`, `sentencia_fecha`, etc. — el JSON que alimenta `ETAPAS`/el stepper en `MapClient.tsx`) y no hace OCR (falla en PDFs escaneados sin capa de texto).
- `/api/boletin/parse-batch` (+ `parse-pdf` para uno solo) — LLM `claude-haiku-4-5` vía Claude Vision, sí hace OCR, sí extrae la cronología completa. Es el que realmente alimenta el stepper.
- **Ambos escriben la misma columna `pdf_parsed`** como flag de "listo". Si el script regex corre sobre un lote, esas filas quedan `pdf_parsed=true` y `parse-batch` las salta para siempre (`.eq('pdf_parsed', false)`) — nunca consiguen cronología, y el stepper de esa concesión queda mudo sin aviso. Hoy el daño es mínimo (7 filas así), pero es una trampa para el futuro si se vuelve a correr el script regex "para adelantar" sobre el backlog.
- **Decisión para este plan**: el drenado automático (punto 2 abajo) usa solo `parse-batch`/OCR. `parse-boletin-pdfs.py` no se integra al flujo automático — si se quiere conservar como parser barato de primera pasada, primero hay que separar su flag a una columna propia (`pdf_parsed_regex`) para que no choque con `parse-batch`.

1. Cron diario existente (`boletin-sync.yml`) se mantiene — trae los pedimentos/manifestaciones/mensuras/sentencias del día.
2. **Nuevo**: cron diario (o extensión del mismo workflow) que llama a `parse-batch` **en loop** hasta que `processed:0` (o hasta un tope de N iteraciones), en vez de una sola llamada — soluciona el problema de timeout del punto 1.2. Puede ser un job de GitHub Actions con un `while` bash simple (igual patrón que `scripts/backfill-boletin.sh`), o convertir `parse-batch` en un endpoint que se autoinvoque vía `waitUntil`/QStash si se quiere sacarlo de Actions.
3. Correr ese drenado una vez manualmente contra el backlog actual (3.308 filas a la fecha) antes de dejarlo en piloto automático — a la cadencia de hoy (~10-20 docs/llamada, unos segundos por doc) son varias decenas/cientos de invocaciones; estimar costo de API Anthropic antes de lanzarlo a full velocidad (ver sección 5).

### D. Backfill hacia atrás para la etapa Manifestación faltante (lo más nuevo/experimental — dejar para el final)

No hay forma barata de "buscar" la manifestación de un expediente detectado tarde — el sitio fuente no tiene buscador. Lo que sí es viable (ya probado hoy a mano):

1. Trigger: un expediente en `expedientes` tiene `mensura_solicitud` pero **no** `manifestacion_publicacion`.
2. Cota superior de búsqueda: Art. 42 Código de Minería — el plazo para pedir mensura es 220 días desde la inscripción de la manifestación. Ventana candidata = `[mensura_solicitud - 220 días, mensura_solicitud]`.
3. Job semanal (no diario — es caro y no urgente) que:
   - junta la **unión** de todas las ventanas pendientes de todos los expedientes con este gap (para no re-sincronizar el mismo día dos veces),
   - corre `/api/boletin/sync?fecha=` para cada día faltante de esa unión (mismo mecanismo que hoy en `scripts/backfill-boletin.sh`, ~5-10s por día),
   - después de sincronizar, busca coincidencias por `titular` + `comuna`/`región` (no por nombre exacto — la manifestación a veces se publica sin el sufijo de fracción, ej. "FRANCISCA FERNANDA" vs "FRANCISCA FERNANDA 1/30") entre las filas nuevas y los expedientes pendientes.
   - **no auto-vincula**: deja el match propuesto en una cola de revisión (`expedientes.manifestacion_candidata_cve`) para que el usuario confirme antes de mergear — evitar que un match por titular+comuna ligue el expediente equivocado.

### E. Integración con PJUD — Oficina Judicial Virtual (investigado 2026-08-11, NO construido)

**Origen**: el usuario reportó que para `SANCHO 1 AL 30`, las 4 fechas de la etapa Manifestación (presentación/orden/inscripción/publicación) apuntaban las 4 al mismo PDF en el modal de `/mapa`, esperando un documento distinto por cada una.

**Primero se verificó que NO es un bug**: se bajó y leyó el PDF real (CVE 2811781) — las 4 fechas efectivamente están narradas dentro de ese único documento (el Conservador de Minas certifica y publica de una vez el historial completo hasta ese punto). Solo existe una publicación en `boletin_publicaciones` para ese expediente — no hay 4 documentos que perdimos, nunca existieron 4 documentos en el boletín. Esto es distinto de `FRANCISCA FERNANDA 1/30`, donde Manifestación y Mensura sí son 2 documentos separados (cada etapa grande se publica por su cuenta; los sub-eventos dentro de una etapa no).

**Pero el usuario mostró que SÍ existe una fuente con documento por movimiento**: `oficinajudicialvirtual.pjud.cl` (portal público de seguimiento de causas del Poder Judicial, no el Diario Oficial). Ahí la misma causa (V-465-2026, 2° Juzgado de Letras de Copiapó — datos que **ya tenemos** de `parse-batch`) muestra 3 movimientos con documento propio cada uno:

| Folio | Trámite | Fecha | Mapea a |
|---|---|---|---|
| 1 | Ingreso Manifestación (Escrito) | 22/04/2026 | `manifestacion_presentac` (match exacto) |
| 2 | Certificado ingreso solicitud | 24/04/2026 | sin campo propio hoy — dato nuevo |
| 3 | Ordena Inscribir y Publicar (Resolución) | 27/04/2026 | `manifestacion_orden` (match exacto) |

Bonus encontrado de paso: el detalle de la causa en PJUD mostraba `Etapa: 1 Mensura` — más avanzado que lo que sabíamos por el boletín (que todavía no había publicado la mensura). PJUD podría detectar cambios de etapa **antes** que el boletín en algunos casos.

**Investigación técnica (sin construir nada, solo explorando en el navegador)**:
1. La búsqueda "Consulta Unificada" > "Búsqueda por RIT" pide, en cascada: Competencia (`Civil` es una de 7 opciones — Corte Suprema/Corte Apelaciones/Civil/Laboral/Penal/Cobranza/Familia) → **Corte de Apelaciones** → Tribunal → Rol → Año. **Corrección sobre lo que se creía "ya lo tenemos" (re-chequeado en vivo el 2026-08-12)**: el parseo LLM (`parse-pdf`) hoy solo extrae `juzgado` (nombre del tribunal) y `causa_rol` — **no extrae la Corte de Apelaciones**, que es un campo obligatorio y distinto del Tribunal en este formulario (un Tribunal pertenece a una Corte, pero no se puede inferir el string exacto que el `<select>` de Corte espera solo a partir del nombre del juzgado sin una tabla de mapeo Juzgado→Corte). Gap nuevo a resolver antes de automatizar: o se construye esa tabla de mapeo (son ~17 Cortes de Apelaciones en Chile, fijas, se arma una vez) o se le pide al LLM que también extraiga la Corte si aparece mencionada en el PDF.
2. El detalle de la causa se pide con `POST` a `.../ADIR_871/civil/modal/causaCivil.php` — esa única llamada devuelve la tabla de "Historia" completa con los 3 links de documento **ya incluidos** (no hace falta pedir cada uno por separado).
3. Cada link es `docuN.php?dtaDoc=<JWT>` — el JWT es válido ~1 hora desde que se generó (`iat`/`exp` en el payload) y su claim `data` es un blob **cifrado**, no volvemos a poder generarlo nosotros sin pasar por el flujo real del sitio. **No se puede guardar el link tal cual** — hay que descargar el PDF al momento de sincronizar y subirlo a storage propio (Supabase Storage) para poder linkearlo después sin que expire.
4. **Hallazgo que cambia el tamaño del problema**: `curl` directo a `indexN.php` (sin navegador) devuelve **403 Forbidden**. El sitio bloquea acceso HTTP simple — a diferencia de `boletinoficialdemineria.cl`/`diariooficial.interior.gob.cl` (que sí funcionan con `fetch` plano, es lo que usan `sync`/`parse-pdf` hoy), automatizar PJUD requeriría **navegador headless real** (Playwright o similar) con sesión persistente — infraestructura nueva, no una extensión de las serverless functions actuales de Vercel.
6. **Sin confirmar (re-chequeado 2026-08-12)**: la página de "Consulta Unificada" muestra un badge de reCAPTCHA visible en la esquina — no se completó una búsqueda real hoy para confirmar si bloquea el submit como invitado o es solo un reCAPTCHA v3 invisible (verificación de riesgo en segundo plano, sin interacción). La sesión anterior (2026-08-11) reportó que la búsqueda "no pide CAPTCHA como invitado", pero no quedó registrado si ya existía este badge entonces. **Antes de comprometerse a la opción 2 (Playwright)**, confirmar con una búsqueda real completa si el reCAPTCHA es solo pasivo (no bloquea) o interactivo (bloquearía un navegador headless sin un servicio de resolución de CAPTCHA aparte, que suma costo y complejidad no contemplados en la sección E.1).
5. No se pudieron ver los parámetros exactos de esas llamadas (el request del click al detalle incluye datos de sesión/cookie) — la herramienta de browser usada para explorar los bloqueó activamente como dato sensible, correctamente: el propio documento descargado (Folio 1) trae RUT y domicilio de una persona natural (el representante), no solo de la sociedad titular.

**Decisión sobre datos personales** (confirmada con el usuario): tratar los documentos de PJUD con el mismo criterio que el boletín — es información judicial igual de pública, PJUD no agrega sensibilidad nueva respecto a lo que el boletín ya expone.

**Se descartó construirlo en esta sesión** — no es una pieza chica: además de lo anterior, hace falta (a) tabla nueva `expediente_movimientos` (expediente_key, folio, trámite, desc_tramite, fecha, foja, storage_path, pjud_synced_at), (b) bucket de Supabase Storage nuevo, (c) reverse-engineering del flujo exacto de request con un navegador de verdad (devtools), no a través de este canal, y (d) decidir dónde correr el navegador headless (no es gratis ni trivial en Vercel).

**Alternativa mucho más barata, no evaluada a fondo pero anotada como fallback**: en vez de traer y guardar los documentos, agregar en el modal un botón "Ver en PJUD" que abra `oficinajudicialvirtual.pjud.cl` con la búsqueda pre-cargada (Tribunal+Rol+Año, todo en query string, sin backend nuevo) — el usuario ve los movimientos y baja el que quiera a mano, sin que nosotros toquemos el JWT ni corramos nada headless.

### E.1 Propuesta (investigación de mercado, 2026-08-12) — 3 opciones, orden de implementación sugerido

Se investigaron fuentes chilenas para "revisar causas de concesiones mineras" además del boletín (Diario Oficial) y PJUD directo. Conclusión: **no existe una fuente nueva que reemplace lo que ya tenemos.** No hay API oficial ni de SERNAGEOMIN ni de PJUD para esto — `boletinoficialdemineria.cl` (ya integrado) sigue siendo correcto y suficiente para "Diario Oficial". Para "Poder Judicial" (el gap real, sección E arriba) apareció una tercera opción de mercado que no estaba en el análisis del 2026-08-11: un proveedor que ya resolvió el scraping headless por nosotros.

**No cambia nada de lo ya construido** — esto es sólo evaluación de cómo cerrar el gap de PJUD, no una migración de la fuente boletín.

| # | Opción | Costo | Esfuerzo | Qué entrega |
|---|---|---|---|---|
| 1 | Link "Ver en PJUD" precargado (ya diseñado, sección E) | $0 | ~1h — un botón en el modal, sin backend | Usuario ve movimientos y documentos a mano, click afuera |
| 2 | Navegador headless propio (Playwright) | Hosting del worker (no corre en Vercel) | Alto — reverse-engineering de sesión/JWT, tabla nueva, storage nuevo | Datos automatizados, guardados, sin costo marginal por consulta |
| 3 | **Nuevo**: API de terceros (`boostr.cl`, plan "Poder Judicial") | **$2.000 CLP por consulta**, mínimo $10.000 CLP (5 consultas), créditos sin vencimiento | Medio — sin infra de scraping propia, solo integrar su API + webhook | Ellos hacen el scraping/headless; nosotros solo consumimos JSON |

**Detalle de la opción 3 (nueva)**: `POST https://api.boostr.cl/poder_judicial/causes.json` (header `X-API-KEY`) es **asíncrona** — se manda `document_number` (RUT) + nombre + `context` (`civil`/`penal`/`apelacion`) + `callback_url`, y el resultado llega después vía webhook a esa URL con un array `causes`. **Ojo, esto importa para nuestro caso de uso**: busca por **RUT/nombre de una persona o empresa**, no por rol+tribunal de una causa puntual — es decir, resuelve "dame todas las causas de este titular", no "dame los movimientos de esta causa que ya identifiqué en el boletín". Puede servir para descubrir causas que no conocíamos, pero **no está confirmado** (la documentación pública no lo especifica) que el array `causes` traiga el detalle de movimientos por folio ni links a documentos — habría que pagar el mínimo de $10.000 CLP y hacer una consulta de prueba contra un RUT conocido (ej. el titular de `SANCHO 1 AL 30`) para comprobarlo antes de comprometer presupuesto en serio. El proveedor además es explícito en que no garantiza actualidad ni completitud de los datos.

**Recomendación**:
1. **Hacer ya la opción 1** (botón "Ver en PJUD" precargado) — cero riesgo, cero costo, cierra el gap de "poder revisar la causa" hoy mismo mientras se decide el resto.
2. **Antes de invertir en 2 o 3, correr una prueba de $10.000 CLP contra la opción 3** con un caso real y confirmar si el array `causes` trae folio/trámite/fecha/documento por movimiento (lo que hoy solo se ve a mano en PJUD). Si sí: la opción 3 es objetivamente más barata que construir y mantener Playwright headless (opción 2) para el volumen actual (~pocas causas/día) — el costo por consulta ($2.000 CLP) es marginal comparado con las horas de ingeniería de reverse-engineering de sesión/JWT. Si no (solo lista causas sin detalle de movimientos), la opción 3 no resuelve el problema real y hay que ir directo a la opción 2 o quedarse en la opción 1.
3. **No construir la opción 2 sin antes descartar la 3** — es la más cara en esfuerzo y la que menos se ajusta a la infraestructura actual (serverless en Vercel, sin worker persistente).

Fuentes consultadas: [boletinoficialdemineria.cl](https://www.boletinoficialdemineria.cl/informacion.php) (confirma que el boletín ya es la fuente correcta y suficiente para Diario Oficial), [SERNAGEOMIN — Catastro Minero Online](https://www.sernageomin.cl/catastro-minero/) (consulta de rol/ubicación de concesión, sin API pública ni datos de causa judicial), [oficinajudicialvirtual.pjud.cl](https://oficinajudicialvirtual.pjud.cl/home/index.php) y [pjud.cl — Consulta de causas](https://www2.pjud.cl/consulta-de-causas2) (portal oficial, sin API pública documentada), [boostr.cl/poder-judicial](https://boostr.cl/poder-judicial) y su documentación (endpoint, [precio](https://docs.boostr.cl/reference/pricing-poder-judicial), [request/response](https://docs.boostr.cl/reference/pjud-get-causas)).

### E.2 Pipeline end-to-end de monitoreo de causas (propuesta, 2026-08-12, NO construido) — une D + E + E.1 + 2.F

**Pregunta que resuelve**: no solo "de dónde sacamos el dato" (E/E.1) sino el circuito completo — **cómo se detecta que una causa tiene algo nuevo, cómo se refleja en nuestra base de datos, y cómo dispara una notificación** — para que quede una sola pieza a construir después, no cuatro sueltas.

**Dos fuentes, dos granularidades — no son intercambiables, son complementarias**:
| Fuente | Qué detecta | Granularidad | Estado |
|---|---|---|---|
| Boletín (`boletin_publicaciones` → `expedientes`) | Cambio de **etapa** grande (Manifestación→Mensura→Sentencia→Inscripción) — cada etapa se publica como documento propio | Gruesa: 1 dato por etapa | ✅ Ya construido (pasos A-C) |
| PJUD (`expediente_movimientos`, tabla nueva) | Cada **movimiento** individual dentro de una causa (ingreso, certificado, resolución) — incluye sub-eventos que el boletín nunca publica por separado (ver `SANCHO 1 AL 30`, sección E) | Fina: varios datos por etapa | 🔍 Propuesto, no construido — depende de decidir opción en E.1 |

Ya vimos en la sección E que PJUD además puede **adelantarse** al boletín (mostró `Etapa: 1 Mensura` antes de que el boletín publicara la mensura) — por eso vale la pena aunque el boletín ya cubra el caso grueso.

**Pipeline propuesto (4 pasos, extiende lo ya diseñado en D/E/2.F — nada nuevo conceptualmente, es la integración)**:

1. **Qué causas monitorear**: mismo universo acotado que 2.F — `expediente_key` distintos presentes en `favoritos`, con `causa_rol`+`juzgado` ya conocidos (vienen del parseo LLM del boletín, paso B). No se monitorea el universo completo de expedientes, solo los favoritos — mismo argumento de escala que 2.F.
2. **Detección**: cron (cadencia según qué opción de E.1 se elija — diaria si es opción 2/Playwright sin costo marginal, semanal o acotada por presupuesto si es opción 3/Boostr a $2.000 CLP/consulta) que, por cada causa a monitorear, trae los movimientos actuales desde la fuente elegida y los compara contra lo ya guardado en `expediente_movimientos` **por folio** (clave natural del movimiento en PJUD) — solo los folios nuevos son "evento".
3. **Actualización de la base de datos**: cada folio nuevo se inserta en `expediente_movimientos` (`expediente_key, folio, tramite, fecha, foja, storage_path/url, fuente:'pjud', sync_at`, tabla ya prevista en la sección E). Si el movimiento implica avance de etapa (ej. "Ordena Inscribir y Publicar" ⇒ etapa Manifestación confirmada), se actualiza también `expedientes.etapa_actual`/`etapa_cambiada_at` — mismo criterio de cálculo que ya usa el boletín (`renderEtapaStepper`/paso B), para no divergir en cómo se decide la etapa según la fuente.
4. **Notificación**: el mismo mecanismo de 2.F (tabla `notificaciones`, campanita), sin canal aparte — se agrega un tercer `tipo: 'pjud_movimiento'` junto a los dos que ya tenía 2.F (`nueva_publicacion`, `cambio_etapa`). El generador de 2.F (paso 3 de su diseño) ya queda escrito para reaccionar a "algo cambió en `expedientes`/tablas relacionadas de un `expediente_key` favorito" — este pipeline solo le agrega una segunda fuente de cambios a vigilar, no un sistema de notificación distinto.

**Por qué no se construye antes de decidir E.1**: el paso 2 (detección) tiene forma distinta según la fuente — webhook asíncrono si es Boostr (opción 3), llamada directa si es Playwright propio (opción 2) — construir el pipeline completo antes de la prueba de $10.000 CLP sería trabajo que probablemente hay que rehacer. Orden correcto: **E.1 (decidir/validar fuente) → E.2 (este pipeline) → 2.F ya queda compatible sin cambios adicionales** porque se diseñó pensando en esta extensión (ver su punto 6, "Futuro, depende de E.1").

## 2.F Notificaciones sobre favoritos (propuesta, 2026-08-12, NO construido)

**Pedido**: correr todos los días, y si hay documento o movimiento nuevo en una causa que el usuario marcó como favorita (`favoritos`, ya existe — `src/app/mapa/favorites.ts`, tabla keyed por `numero_rol`), notificarlo. Preocupación explícita del usuario: **son muchas las concesiones** — la solución tiene que escalar.

### La razón por la que esto escala bien: no hay que vigilar el universo completo

El miedo natural es "¿vamos a chequear miles de concesiones todos los días?". No — **el trabajo caro (bajar boletín, parsear PDF con LLM) ya corre todos los días para el universo completo, sin importar si algo está favorito o no** (paso C, `boletin-parse.yml`, ya construido). Lo único que falta es una comparación barata, sobre datos que ya están materializados en `expedientes` (`etapa_actual`/`etapa_cambiada_at`/`updated_at`, paso B, ya construido) — eso es una query SQL, no una llamada a un sitio externo. El costo de esa comparación escala con **la cantidad de expedientes distintos que alguien tiene en favoritos** (acotado, probablemente cientos, no con el universo total de concesiones (miles) ni con la cantidad de usuarios × favoritos (se deduplica por `expediente_key`).

La única pieza que sí es sensible a escala es una futura vigilancia de movimientos PJUD por causa (sección E.1, opción 3) porque cuesta $2.000 CLP por consulta a un tercero — por eso el diseño de abajo la deja explícitamente acotada solo a favoritos, y aparte del chequeo diario gratis de boletín.

### Gap a cerrar primero: `favoritos` no sabe a qué `expediente_key` corresponde

`favoritos` guarda `numero_rol` (rol SERNAGEOMIN de la concesión) + una copia de `nombre`/`titular_nombre`/`comuna` al momento de guardar — no guarda `expediente_key` (la clave de agrupación judicial del boletín, sección A). Hoy esa correlación se hace al vuelo cuando se abre el modal (`/api/boletin/concesion?nombre=&titular=`, `ilike(nombre)` + desambiguación por `titular`). Para notificaciones hace falta la relación resuelta y guardada, no recalculada cada vez.

### Diseño propuesto (4 piezas)

**1. Migración — `favoritos.expediente_key`** (nullable, `text`)
Se completa al guardar el favorito (mismo matching que `/api/boletin/concesion`, reusar esa lógica) y con un backfill puntual para los favoritos ya existentes. Puede quedar `null` si el nombre/titular todavía no tiene ninguna publicación indexada — se reintenta en el próximo backfill nocturno, no bloquea el guardado del favorito.

**2. Migración — tabla `notificaciones`**
```
id, user_id, expediente_key, tipo ('nueva_publicacion' | 'cambio_etapa'),
titulo, mensaje, url (deep-link al modal de /mapa), created_at, leida_at (nullable)
```
Una fila por (usuario que lo favoriteó) × (evento) — si 3 usuarios favoritearon el mismo expediente, son 3 filas, cada uno con su propio estado de leído. RLS: cada usuario solo lee las suyas (mismo patrón que `favoritos`).

**3. Job diario — generador de notificaciones**
Nuevo paso al final de `boletin-parse.yml` (mismo cron, después de que el drenado deja `expedientes` al día) o workflow separado que llama a un endpoint nuevo `/api/notificaciones/generar` (protegido con el mismo secret que `sync`/`parse-batch`):
- `SELECT DISTINCT expediente_key FROM favoritos WHERE expediente_key IS NOT NULL`
- Por cada uno, compara `expedientes.etapa_cambiada_at` / `publicaciones_count` contra la última notificación ya generada para ese `expediente_key` (o un timestamp de "última corrida" guardado en el propio job).
- Si cambió: inserta una `notificaciones` por cada `user_id` en `favoritos` que tenga ese `expediente_key`.
- Costo: una corrida de SQL sobre, en el peor caso, unos pocos miles de filas — segundos, no minutos. Cero llamadas a sitios externos nuevas.

**4. UI — campanita de notificaciones**
Badge con contador de `leida_at is null` en el header de `/mapa` (o global en el layout si tiene sentido mostrarlo fuera de `/mapa` también). Dropdown con la lista, click marca `leida_at` y abre el modal de esa concesión (reusa el flujo de apertura de modal que ya existe para favoritos). Sin esto la tabla `notificaciones` no sirve de nada — es la mitad visible del feature.

### Fase 1b (opcional, no bloqueante) — email además de in-app

Con `profiles.email` ya disponible, un digest diario (no un correo por evento — evita spam si un usuario tiene muchos favoritos activos ese día) resumiendo las notificaciones nuevas. Requiere agregar un proveedor transaccional (ej. Resend — no hay ninguno en `package.json` hoy; el envío de invitación/reset actual usa el SMTP propio de Supabase Auth, pensado para correos de autenticación, no para volumen transaccional). Dejar para después de validar que el in-app-only ya resuelve el caso de uso — no construir email sin que el usuario lo pida.

### Relación con la sección 3 (abajo)

La sección 3 ("Novedades del boletín") es una vista **global/admin** de todo lo que cambió, para revisar concesión por concesión sin filtrar por usuario. Esta sección 2.F es el mismo dato (`etapa_cambiada_at` de `expedientes`) pero **filtrado por lo que cada usuario marcó como relevante** y empujado como notificación, no como lista para navegar. Se pueden construir en cualquier orden — 2.F no depende de que la sección 3 exista primero, ambas leen de la misma tabla `expedientes` ya materializada.

### Orden de implementación sugerido
1. `favoritos.expediente_key` (migración + backfill + wireo en `addFavorito`).
2. Tabla `notificaciones` + RLS.
3. Endpoint `/api/notificaciones/generar` + paso nuevo en el cron diario.
4. Campanita en el header + dropdown + marcar leída.
5. (Opcional) digest por email vía Resend, solo si el in-app no alcanza.
6. (Futuro, depende de E.1) extender el generador para también diffear movimientos PJUD de los favoritos que tengan `causa_rol`+`juzgado`, acotado y con cadencia más espaciada que diaria dado el costo por consulta.

## 3. Vista de revisión ("Novedades del boletín")

Nueva sección (en `/boletin` o un tab nuevo) que lista, ordenado por `etapa_cambiada_at desc`:

```
[FRANCISCA FERNANDA 1/30]  Mensura → Sentencia   27-07-2026   [ Marcar revisado ]
[OTRA CONCESION 1/15]      Manifestación → Mensura  05-08-2026 [ Marcar revisado ]
```

Filtro por `revisado_at is null` para ver solo lo pendiente de mirar. Esto es lo que resuelve el "que después lo pueda ir revisando y validando cuando haya actualizaciones" del pedido original — sin esto, el usuario tendría que ir concesión por concesión adivinando qué cambió.

## 4. Orden de implementación sugerido

1. ✅ `expediente_key` + migración de `/api/boletin/concesion` y `MapClient.tsx` al nuevo agrupador — **bloqueante para todo lo demás**.
2. ✅ Tabla `expedientes` + upsert en `parse-pdf`/`parse-batch`.
3. ✅ Drenado automático diario de `parse-batch` (cron + loop) — soluciona backlog y da consistencia día a día. Activo desde que este commit llegó a `main`/`origin`. **Desactivado manualmente el 2026-08-14** (ver nota en la sección de Estado arriba) — el mecanismo sigue construido y probado, solo apagado a nivel de GitHub Actions.
4. ⏳ Vista "Novedades del boletín" con marcado de revisado — no empezada. Requiere además migrar `/api/boletin/concesion`/`MapClient.tsx` a leer de `expedientes` en vez de recalcular en vivo (la tabla ya existe y se mantiene al día, pero hoy nada la lee).
5. ⏳ Job semanal de backfill hacia atrás (D) — no empezado, dejar para el final, es lo más costoso/experimental y lo que menos urgencia tiene una vez que 1-4 estén andando (para expedientes nuevos que arrancan en manifestación, el gap ni siquiera existe).
6. 🔍 Integración PJUD (E) — investigado, no empezado. Antes de construir la versión completa (navegador headless + storage), considerar primero el fallback barato ("Ver en PJUD" con búsqueda pre-cargada, sin backend nuevo) y ver si eso ya alcanza.

## 5. Costos/riesgos a tener presente

- **Costo de API Anthropic**: cada PDF parseado es una llamada a `claude-haiku-4-5`. Con ~2000 de backlog + flujo diario nuevo, vale la pena estimar el costo antes de automatizar el drenado a full velocidad.
- **Rate/carga sobre `diariooficial.interior.gob.cl`**: el job de backfill semanal (punto D) puede terminar sincronizando decenas de días de golpe — mantener el `sleep` entre requests que ya usa `scripts/backfill-boletin.sh`/el loop de hoy para no golpear el sitio fuente de forma agresiva.
- **No hay journaling de qué se muestra al usuario vs qué es una inferencia** — la etapa "alcanzada por implicancia legal" (ej. si hay sentencia, se asume que manifestación y mensura ya ocurrieron aunque no tengan fecha) ya está en el stepper actual (`renderEtapaStepper`); mantener ese criterio también en `expedientes.etapa_actual` server-side para no divergir del cálculo client-side existente.
