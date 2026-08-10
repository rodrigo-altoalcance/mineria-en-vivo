@AGENTS.md

## Convención: Supabase Auth redirects

El proyecto usa `@supabase/ssr` (`createBrowserClient` / `createServerClient`), lo que implica **flujo PKCE**. Cualquier `emailRedirectTo` (en `auth.signUp()`) o `redirectTo` (en `auth.admin.inviteUserByEmail()` / `auth.admin.generateLink()` / `auth.resetPasswordForEmail()`) **debe** apuntar a `/auth/callback?next=<ruta-destino>` — nunca directo a una ruta protegida (`/mapa`, `/cuenta`, etc.). `src/app/auth/callback/route.ts` es el único lugar que llama `exchangeCodeForSession()`; sin pasar por ahí, el link de confirmación/invitación/recuperación no genera sesión y el middleware rebota al usuario a `/login`.

## `/boletin`: selector de rango de fechas (reemplaza el calendario de día único)

`src/app/boletin/page.tsx` (Server Component) lee `desde`/`hasta` desde `searchParams` (patrón ya usado en `/mapa?nombre=`, no un endpoint nuevo) y consulta Supabase con `.gte('fecha', desde).lte('fecha', hasta)` — **nunca** filtra un buffer precargado (`boletin_publicaciones` sigue recibiendo backfill histórico en paralelo; un `.limit(N)` sobre las filas más recientes produciría resultados vacíos para rangos antiguos). El índice `boletin_fecha_idx` (btree sobre `fecha DESC`) ya existía; no se creó ninguno nuevo.

- **Regla de negocio**: el rango máximo es 3 **meses calendario** (no días fijos — ver `addMonths` en `src/lib/dateRange.ts`, que clampa a fin de mes en overflow, p.ej. 31 ene + 1 mes = 28/29 feb). Si el usuario intenta excederlo desde el picker, se rechaza y aparece `AlertDialog` — **no hay clamp silencioso en la interacción de usuario**. El picker además deshabilita visualmente las fechas fuera de rango una vez fijado el otro extremo (`minDate`/`maxDate` en el `Calendario` de `BoletinClient.tsx`), como refuerzo, no como único mecanismo.
- El servidor sí tiene una válvula de seguridad distinta: si la URL se edita a mano con un rango inválido (no es una interacción del picker), `resolverRango()` en `src/lib/dateRange.ts` recorta el `desde` para la query — comportamiento de sanitización de backend, no la corrección-silenciosa-al-usuario que la tarea prohibió.
- Se eliminó la lista `fechas` (2000 filas) que alimentaba los "puntitos" de días con publicaciones en el mini-calendario — mantenerla habría requerido el mismo antipatrón de buffer precargado. El calendario en modo rango ya no muestra esa decoración; si se quiere recuperar, debe ser vía una query acotada al mes visible, no un fetch global.
- Nuevo componente reutilizable: `src/components/ui/AlertDialog.tsx` (modal de advertencia genérico, mismo chrome que `InviteModal`). Reutilizar antes de crear otro modal similar.
- Búsqueda por nombre/titular y filtros de categoría/región siguen siendo client-side, pero ahora aplican sobre el resultado ya acotado por rango (antes era sobre el día único).
