@AGENTS.md

## Convención: Supabase Auth redirects

El proyecto usa `@supabase/ssr` (`createBrowserClient` / `createServerClient`), lo que implica **flujo PKCE**. Cualquier `emailRedirectTo` (en `auth.signUp()`) o `redirectTo` (en `auth.admin.inviteUserByEmail()` / `auth.admin.generateLink()` / `auth.resetPasswordForEmail()`) **debe** apuntar a `/auth/callback?next=<ruta-destino>` — nunca directo a una ruta protegida (`/mapa`, `/cuenta`, etc.). `src/app/auth/callback/route.ts` es el único lugar que llama `exchangeCodeForSession()`; sin pasar por ahí, el link de confirmación/invitación/recuperación no genera sesión y el middleware rebota al usuario a `/login`.
