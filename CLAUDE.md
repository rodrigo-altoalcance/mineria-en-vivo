@AGENTS.md

## Convención: Supabase Auth redirects

El proyecto usa `@supabase/ssr` (`createBrowserClient` / `createServerClient`), lo que implica **flujo PKCE**. Cualquier `emailRedirectTo` (en `auth.signUp()`) o `redirectTo` (en `auth.admin.inviteUserByEmail()` / `auth.admin.generateLink()` / `auth.resetPasswordForEmail()`) **debe** apuntar a `/auth/callback?next=<ruta-destino>` — nunca directo a una ruta protegida (`/mapa`, `/cuenta`, etc.). `src/app/auth/callback/route.ts` es el único lugar que llama `exchangeCodeForSession()`; sin pasar por ahí, el link de confirmación/invitación/recuperación no genera sesión y el middleware rebota al usuario a `/login`.

## `/boletin`: selector de rango de fechas (reemplaza el calendario de día único)

`src/app/boletin/page.tsx` (Server Component) lee `desde`/`hasta` desde `searchParams` (patrón ya usado en `/mapa?nombre=`, no un endpoint nuevo) y consulta Supabase con `.gte('fecha', desde).lte('fecha', hasta)` — **nunca** filtra un buffer precargado (`boletin_publicaciones` sigue recibiendo backfill histórico en paralelo; un `.limit(N)` sobre las filas más recientes produciría resultados vacíos para rangos antiguos). El índice `boletin_fecha_idx` (btree sobre `fecha DESC`) ya existía; no se creó ninguno nuevo.

- **Regla de negocio**: el rango máximo es 3 **meses calendario** (no días fijos — ver `addMonths` en `src/lib/dateRange.ts`, que clampa a fin de mes en overflow, p.ej. 31 ene + 1 mes = 28/29 feb). Si el usuario intenta excederlo desde el picker, se rechaza y aparece `AlertDialog` — **no hay clamp silencioso en la interacción de usuario**. El picker además deshabilita visualmente las fechas fuera de rango una vez fijado "desde" (`maxDate` en el `Calendario` de `BoletinClient.tsx`), como refuerzo, no como único mecanismo.
- El servidor sí tiene una válvula de seguridad distinta: si la URL se edita a mano con un rango inválido (no es una interacción del picker), `resolverRango()` en `src/lib/dateRange.ts` recorta el `desde` para la query — comportamiento de sanitización de backend, no la corrección-silenciosa-al-usuario que la tarea prohibió.
- Se eliminó la lista `fechas` (2000 filas) que alimentaba los "puntitos" de días con publicaciones en el mini-calendario — mantenerla habría requerido el mismo antipatrón de buffer precargado. El calendario en modo rango ya no muestra esa decoración; si se quiere recuperar, debe ser vía una query acotada al mes visible, no un fetch global.
- Nuevo componente reutilizable: `src/components/ui/AlertDialog.tsx` (modal de advertencia genérico, mismo chrome que `InviteModal`). Reutilizar antes de crear otro modal similar.
- Búsqueda por nombre/titular y filtros de categoría/región siguen siendo client-side, pero ahora aplican sobre el resultado ya acotado por rango (antes era sobre el día único).

### Default de primera carga: un solo día, no una ventana de 7 días

`resolverRango()` (`src/lib/dateRange.ts`) ya calculaba el `hasta` por defecto como la fecha más reciente con publicaciones (`page.tsx` la obtiene con una query dedicada `order('fecha', desc).limit(1)`, independiente de la lista `fechas` eliminada arriba) — ese fallback "hoy, o el día más reciente con datos si hoy no hay (fin de semana/feriado)" **ya existía y no se perdió en el refactor de rango**, así que no se reescribió. Lo único que cambió: `defaultDesde` calculaba `hastaDefault - 6 días` (ventana de 7 días); ahora es `defaultDesde = hastaDefault`, o sea el rango inicial al entrar a `/boletin` sin `desde`/`hasta` en la URL es un solo día. El usuario amplía el rango manualmente desde ahí (hasta el máximo de 3 meses, sin cambios). No se tocó el cap de 3 meses ni la query server-side por rango.

Nota: el indicador visual ("puntito") de "este día tiene publicaciones" en el mini-calendario **no existe actualmente** en `Calendario` (`BoletinClient.tsx`) — se eliminó junto con la lista `fechas` en el refactor anterior y no se ha reintroducido.

### Un solo calendario para "desde" y "hasta" (reemplaza los dos pickers separados)

`SelectorFecha` (`BoletinClient.tsx`) reemplazó a `SelectorRango`: un solo botón (`📅 fecha` o `📅 desde – hasta`) abre **un único** popover con un `Calendario`, en vez de dos botones con dos calendarios independientes. La selección es de dos clics dentro del mismo popover, manejada por un estado local `paso: 'desde' | 'hasta'` que se reinicia a `'desde'` cada vez que se abre:

1. **1er clic** (o clic en un día anterior a "desde" mientras se espera el 2° clic) → fija `desde` **y** `hasta` al mismo día (rango de un día) vía `onRangoChange(iso, iso)`, y pasa a esperar el 2° clic.
2. **2º clic** (día ≥ "desde") → fija `hasta` vía `onRangoChange(desde, iso)` y cierra el popover.

`Calendario` ya no recibe `selected`/`minDate` (se quitó `minDate`, quedó sin uso tras este cambio) — ahora recibe `desde`/`hasta` y resalta el rango completo (extremos + días intermedios), no solo un día. El tope de 3 meses se sigue aplicando vía `maxDate={maxHastaPara(desde)}` **solo mientras se espera el 2° clic** — por construcción no se puede clickear un "hasta" inválido, así que no hace falta deshabilitar nada en el 1er clic. `handleDesdeChange`/`handleHastaChange` (dos funciones separadas) se colapsaron en `handleRangoChange(desde, hasta)`, un único punto de validación (`excedeRangoMaximo`) que setea ambos extremos a la vez — evita el bug de validar "desde" nuevo contra un "hasta" viejo (y viceversa) que tenía la validación por-campo.
