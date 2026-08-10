@AGENTS.md

## Convención: Supabase Auth redirects

El proyecto usa `@supabase/ssr` (`createBrowserClient` / `createServerClient`), lo que implica **flujo PKCE**. Cualquier `emailRedirectTo` (en `auth.signUp()`) o `redirectTo` (en `auth.admin.inviteUserByEmail()` / `auth.admin.generateLink()` / `auth.resetPasswordForEmail()`) **debe** apuntar a `/auth/callback?next=<ruta-destino>` — nunca directo a una ruta protegida (`/mapa`, `/cuenta`, etc.). `src/app/auth/callback/route.ts` es el único lugar que llama `exchangeCodeForSession()`; sin pasar por ahí, el link de confirmación/invitación/recuperación no genera sesión y el middleware rebota al usuario a `/login`.

## `/boletin`: selector de fecha (un solo calendario, no dos)

`src/app/boletin/page.tsx` (Server Component) lee `desde`/`hasta` desde `searchParams` (patrón ya usado en `/mapa?nombre=`, no un endpoint nuevo) y consulta Supabase con `.gte('fecha', desde).lte('fecha', hasta)` — **nunca** filtra un buffer precargado (`boletin_publicaciones` sigue recibiendo backfill histórico en paralelo; un `.limit(N)` sobre las filas más recientes produciría resultados vacíos para rangos antiguos). El índice `boletin_fecha_idx` (btree sobre `fecha DESC`) ya existía; no se creó ninguno nuevo.

En el cliente (`BoletinClient.tsx`), `SelectorFecha` monta **un solo** `<Calendario>` (un botón, un popover) — no `SelectorRango` con dos botones/dos calendarios. Selección en dos clics dentro del mismo popover: el primer clic fija `desde=hasta` (rango de un día); el segundo fija `hasta` (o, si el día clickeado es anterior a `desde`, reinicia la selección tomándolo como nuevo `desde`).

- **Regla de negocio (3 meses)**: el rango máximo es 3 **meses calendario** (no días fijos — ver `addMonths` en `src/lib/dateRange.ts`, que clampa a fin de mes en overflow, p.ej. 31 ene + 1 mes = 28/29 feb). Si el usuario intenta excederlo, se rechaza y aparece `AlertDialog` — **no hay clamp silencioso en la interacción de usuario**. Por construcción, el segundo clic no puede caer fuera del tope: `Calendario` recibe `maxDate` ya calculado por `SelectorFecha` (`maxHastaPara(desde)`, acotado además por "hoy" — ver abajo) y deshabilita esas celdas.
- **Regla de negocio (solo pasado)**: no se puede seleccionar ni navegar a fechas futuras. `Calendario` deshabilita toda celda `> maxDate`, y `maxDate` nunca supera `todayISO()` (aunque el tope de 3 meses diera una fecha más lejana). La navegación de mes (`›`) se deshabilita aparte, de forma independiente al tope de 3 meses, apenas el mes visible llega al mes actual — comparación directa contra `todayISO()`, no contra `maxDate` (que puede ser más restrictivo si el tope de 3 meses cae antes de hoy).
- El servidor tiene una válvula de seguridad distinta: si la URL se edita a mano con un rango inválido (no es una interacción del picker), `resolverRango()` en `src/lib/dateRange.ts` recorta el `desde` para la query — sanitización de backend, no la corrección-silenciosa-al-usuario que la tarea prohibió.
- **Puntito de "este día tiene publicaciones"**: reintroducido, pero sin volver al antipatrón del buffer de 2000 filas. `Calendario` dispara un `useEffect` en cada cambio de mes visible (`[viewYear, viewMonth]`) que hace un `select('fecha')` sobre `boletin_publicaciones` acotado con `.gte`/`.lte` al primer y último día de ese mes, vía el cliente browser (`src/lib/supabase/client.ts`). RLS ya lo permite sin cambios: policy `boletin_auth_read` da `SELECT` a `authenticated` sin restricción (`qual: true`), y `/boletin` ya exige sesión — no hizo falta migración ni política nueva.
- Componente reutilizable: `src/components/ui/AlertDialog.tsx` (modal de advertencia genérico, mismo chrome que `InviteModal`). Reutilizar antes de crear otro modal similar.
- Búsqueda por nombre/titular y filtros de categoría/región siguen siendo client-side, sobre el resultado ya acotado por rango.

### Default de primera carga: un solo día, no una ventana de 7 días

`resolverRango()` (`src/lib/dateRange.ts`) calcula el `hasta` por defecto como la fecha más reciente con publicaciones (`page.tsx` la obtiene con una query dedicada `order('fecha', desc).limit(1)`) — fallback "hoy, o el día más reciente con datos si hoy no hay (fin de semana/feriado)". `defaultDesde = hastaDefault`: el rango inicial al entrar a `/boletin` sin `desde`/`hasta` en la URL es un solo día; el usuario amplía el rango manualmente desde ahí (hasta el máximo de 3 meses). No se tocó el cap de 3 meses ni la query server-side por rango.

### Historial: se implementó → se revirtió por accidente → se reimplementó (2026-08-10)

El 2026-08-10 la unificación (`SelectorRango` → `SelectorFecha`, un solo calendario) se implementó en el commit `53de5fc`, mergeado a `main` vía `b3a29fb`. Dos minutos después quedó revertida en `main` por el commit `b1acac5`. **La causa no fue un bug en el código** — se reconstruyó completa a partir de las transcripciones de sesión (`~/.claude/projects/.../*.jsonl`), porque el mensaje del commit de revert no traía motivo:

Dos sesiones de Claude Code corrían en paralelo sobre el mismo repo local. Una construía la unificación del calendario y commiteó `53de5fc` en `dev`. La otra, en una tarea no relacionada (arreglar el cron `boletin-sync`), corrió `git merge dev → main` para publicar su propio fix y sin querer arrastró también ese commit recién hecho por la primera. Al notarlo, le preguntó al usuario explícitamente vía tarjeta de opciones ("Dejarlo así, estaba listo igual" vs. "Revertir solo ese commit de main, mantenerlo en dev") — la respuesta elegida fue revertirlo de `main`, precisamente para no publicar a producción un feature de otra tarea aún no verificada. Ni CI ni el build de Vercel fallaron en ningún momento (ambos commits, `53de5fc` y `b1acac5`, tienen deploys con `state: success`).

El "siguen los 2 calendarios" que el usuario reportó después, en la sesión donde sí se construyó el feature, coincide en el tiempo con haber probado el sitio justo después de ese revert en la otra sesión — consistente con estar viendo `main` ya revertido, no necesariamente un defecto nuevo del código (esa investigación quedó cortada antes de confirmarlo con una captura de producción).

**Lección aplicada — ver memoria `mineria-en-vivo-localhost-first-workflow`**: desde este incidente, todo cambio se desarrolla y verifica contra `localhost` (`npm run dev`) antes de mergear a `main` o desplegar. Evitar sesiones/terminales concurrentes tocando el mismo working directory sin coordinación.

### Estado al momento de escribir esto (2026-08-10)

La reimplementación (calendario único + tope "solo pasado" + puntito por mes) está en el working tree local de `src/app/boletin/BoletinClient.tsx` — **build y `tsc --noEmit` limpios**, verificación visual en `localhost:3000/boletin` en curso. Todavía no está commiteada ni pusheada a `dev`/`main`. Si estás leyendo esto y quieres confirmar que ya se ve en el entorno donde pruebas: revisa `git log --oneline -3 src/app/boletin/BoletinClient.tsx` para ver si ya hay un commit posterior a `b1acac5` tocando ese archivo, y confirma que `main`/`origin/main` lo tienen (`git diff origin/main main` vacío = ya está publicado).
