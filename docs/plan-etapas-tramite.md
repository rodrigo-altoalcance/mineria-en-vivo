# Plan: cronología completa (Manifestación → Mensura → Sentencia → Inscripción CBR) para todas las concesiones

> Este documento es el plan de trabajo para otra conversación de Claude Code. Contexto previo (sesión 2026-08-11): se implementó el stepper de etapa + grid de cronología en `/mapa` (commit `853f8a1`), se corrigió un bug de extracción de coordenadas azimut+distancia (commit `01249fd`), y se backfilleó/parseó manualmente el caso `FRANCISCA FERNANDA 1/30` (CVE 2789742 manifestación + CVE 2848521 mensura) como prueba de concepto end-to-end. Este plan generaliza ese proceso manual a todas las concesiones.

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

### A. Clave de agrupación estable por expediente (hacer primero — todo lo demás depende de esto)

- Agregar columna `expediente_key` a `boletin_publicaciones` (o tabla nueva `expedientes`).
- Una vez parseado un documento (`causa_rol` + `juzgado` ya extraídos), esa combinación es la clave fuerte — es único por causa judicial en Chile.
- Para filas sin parsear todavía, usar un fallback débil: `slugify(nombre) + slugify(titular) + region` — suficiente para no perder el hilo mientras se espera el parse, pero se re-concilia con la clave fuerte apenas el parse corre.
- Migrar `/api/boletin/concesion` (y el merge de `MapClient.tsx`) para agrupar por `expediente_key` en vez de `ilike(nombre)`.

### B. Materializar tabla `expedientes` (estado consolidado por trámite)

Una fila por `expediente_key` con:
- `nombre`, `titular`, `juzgado`, `causa_rol`, `region`, `comuna`
- las 9 fechas de cronología (merge ya resuelto, no recalculado en cada request)
- `etapa_actual` (manifestación/mensura/sentencia/inscripción — mismo cálculo que `etapaActualIdx` en `MapClient.tsx`, pero server-side y persistido)
- `etapa_anterior` + `etapa_cambiada_at` — para poder mostrar "qué avanzó desde ayer"
- `revisado_at` (nullable) — el usuario marca como revisado cuando ya lo validó

`parse-pdf`/`parse-batch` hacen upsert en esta tabla además de actualizar la fila de `boletin_publicaciones` (igual que hoy mergean `doc`, pero ahora el merge se guarda consolidado, no recalculado client-side cada vez).

### C. Automatizar lo que hoy es manual (sync diario + drenado de parse)

1. Cron diario existente (`boletin-sync.yml`) se mantiene — trae los pedimentos/manifestaciones/mensuras/sentencias del día.
2. **Nuevo**: cron diario (o extensión del mismo workflow) que llama a `parse-batch` **en loop** hasta que `processed:0` (o hasta un tope de N iteraciones), en vez de una sola llamada — soluciona el problema de timeout del punto 1.2. Puede ser un job de GitHub Actions con un `while` bash simple (igual patrón que `scripts/backfill-boletin.sh`), o convertir `parse-batch` en un endpoint que se autoinvoque vía `waitUntil`/QStash si se quiere sacarlo de Actions.
3. Correr ese drenado una vez manualmente contra el backlog actual (~2000 filas) antes de dejarlo en piloto automático — a la cadencia de hoy (~10 docs/llamada, unos segundos por doc) son varias decenas de invocaciones, asumible en un rato.

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

1. `expediente_key` + migración de `/api/boletin/concesion` y `MapClient.tsx` al nuevo agrupador — **bloqueante para todo lo demás**.
2. Tabla `expedientes` + upsert en `parse-pdf`/`parse-batch`.
3. Drenado automático diario de `parse-batch` (cron + loop) — soluciona backlog y da consistencia día a día.
4. Vista "Novedades del boletín" con marcado de revisado.
5. Job semanal de backfill hacia atrás (D) — dejar para el final, es lo más costoso/experimental y lo que menos urgencia tiene una vez que 1-4 estén andando (para expedientes nuevos que arrancan en manifestación, el gap ni siquiera existe).

## 5. Costos/riesgos a tener presente

- **Costo de API Anthropic**: cada PDF parseado es una llamada a `claude-haiku-4-5`. Con ~2000 de backlog + flujo diario nuevo, vale la pena estimar el costo antes de automatizar el drenado a full velocidad.
- **Rate/carga sobre `diariooficial.interior.gob.cl`**: el job de backfill semanal (punto D) puede terminar sincronizando decenas de días de golpe — mantener el `sleep` entre requests que ya usa `scripts/backfill-boletin.sh`/el loop de hoy para no golpear el sitio fuente de forma agresiva.
- **No hay journaling de qué se muestra al usuario vs qué es una inferencia** — la etapa "alcanzada por implicancia legal" (ej. si hay sentencia, se asume que manifestación y mensura ya ocurrieron aunque no tengan fecha) ya está en el stepper actual (`renderEtapaStepper`); mantener ese criterio también en `expedientes.etapa_actual` server-side para no divergir del cálculo client-side existente.
