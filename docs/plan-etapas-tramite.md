# Plan: cronología completa (Manifestación → Mensura → Sentencia → Inscripción CBR) para todas las concesiones

> Este documento es el plan de trabajo para otra conversación de Claude Code. Contexto previo (sesión 2026-08-11): se implementó el stepper de etapa + grid de cronología en `/mapa` (commit `853f8a1`), se corrigió un bug de extracción de coordenadas azimut+distancia (commit `01249fd`), y se backfilleó/parseó manualmente el caso `FRANCISCA FERNANDA 1/30` (CVE 2789742 manifestación + CVE 2848521 mensura) como prueba de concepto end-to-end. Este plan generaliza ese proceso manual a todas las concesiones.

## Estado (sesión 2026-08-11, continuación — pasos A, B, C hechos)

- ✅ **Paso A — `expediente_key`**: commit `03425c0`. Migración aplicada, backfill corrido sobre las 3.643 filas existentes (0 sin key, 429 con clave fuerte, 3.536 expedientes distintos). `sync`/`parse-pdf`/`parse-batch`/`/api/boletin/concesion`/`MapClient.tsx` migrados. Verificado en navegador: `FRANCISCA FERNANDA 1/30` agrupa bien, y nombres duplicados reales (`ATENEA 1/10`, 2 titulares distintos) ya se desambiguan por `titular`.
- ✅ **Paso B — tabla `expedientes`**: commit `0555748`. Migración aplicada, `upsertExpediente()` en `src/lib/expedientes.ts`, wireado en `parse-pdf`/`parse-batch`. Backfill inicial: 3.536 expedientes materializados (`scripts/backfill-expedientes.mjs`). Bug encontrado y corregido en el camino: los campos planos (juzgado/causa_rol/inscripcion_fs/etc.) NO se mergean entre documentos — se toman solo del más reciente, igual que `MapClient.tsx` (mergearlos filtraba inscripciones de manifestaciones viejas y hacía creer que el expediente ya estaba en Inscripción CBR). **Pendiente**: `/api/boletin/concesion`/`MapClient.tsx` siguen leyendo en vivo (recalculando), todavía no leen de esta tabla — la migración de lectura queda para cuando se construya la sección 3 (Novedades).
- ✅ **Paso C — drenado automático**: commit `38162d2`. `.github/workflows/boletin-parse.yml`, cron 11:30 CLT (30 min después del sync), loop con tope conservador `limit=8 × max_iter=40` (~320 docs/día) para no drenar los ~3.300 pendientes de un saque. Probado en vivo contra producción (5 docs reales, `processed:5 success:5 errors:0`) — confirmado que `expediente_key` se promueve y `expedientes` se materializa correctamente end-to-end.
- ✅ **Extra no planeado, pedido durante la sesión**: cronología del modal `/mapa` ahora es clickeable — cada fecha (stepper + grilla) y los campos Juzgado/Causa ROL/Conservador/FS-N° abren, en pestaña nueva, el PDF específico del que salió ese dato (antes solo había un link genérico "Ver PDF" al documento más reciente). Commit `d0a6886`, `src/lib/etapaTramite.ts::mergeCronologiaConFuente()`.
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
3. ✅ Drenado automático diario de `parse-batch` (cron + loop) — soluciona backlog y da consistencia día a día. Activo desde que este commit llegue a `main`/`origin` — primera corrida automática mañana 11:30 CLT.
4. ⏳ Vista "Novedades del boletín" con marcado de revisado — no empezada. Requiere además migrar `/api/boletin/concesion`/`MapClient.tsx` a leer de `expedientes` en vez de recalcular en vivo (la tabla ya existe y se mantiene al día, pero hoy nada la lee).
5. ⏳ Job semanal de backfill hacia atrás (D) — no empezado, dejar para el final, es lo más costoso/experimental y lo que menos urgencia tiene una vez que 1-4 estén andando (para expedientes nuevos que arrancan en manifestación, el gap ni siquiera existe).

## 5. Costos/riesgos a tener presente

- **Costo de API Anthropic**: cada PDF parseado es una llamada a `claude-haiku-4-5`. Con ~2000 de backlog + flujo diario nuevo, vale la pena estimar el costo antes de automatizar el drenado a full velocidad.
- **Rate/carga sobre `diariooficial.interior.gob.cl`**: el job de backfill semanal (punto D) puede terminar sincronizando decenas de días de golpe — mantener el `sleep` entre requests que ya usa `scripts/backfill-boletin.sh`/el loop de hoy para no golpear el sitio fuente de forma agresiva.
- **No hay journaling de qué se muestra al usuario vs qué es una inferencia** — la etapa "alcanzada por implicancia legal" (ej. si hay sentencia, se asume que manifestación y mensura ya ocurrieron aunque no tengan fecha) ya está en el stepper actual (`renderEtapaStepper`); mantener ese criterio también en `expedientes.etapa_actual` server-side para no divergir del cálculo client-side existente.
