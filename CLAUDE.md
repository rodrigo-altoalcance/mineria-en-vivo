@AGENTS.md

## Changelog

### 2026-08-07 — fix/concesiones-auth-gate
Cerrados dos endpoints que escribían en Supabase con `service_role` sin ningún
chequeo de sesión ni rol:
- `src/app/api/concesiones/sernageomin/route.ts` (fire-and-forget a
  `admin.rpc('upsert_concesiones_batch', ...)`)
- `src/app/api/concesiones/detalle/route.ts` (upsert fire-and-forget a
  `concesiones_detalle`)

Ambos son consumidos únicamente por `src/app/mapa/MapClient.tsx` (client-side,
sin headers de auth). Ningún cron de GitHub Actions les pega directo —
`concesiones-sync.yml` escribe directo a Supabase vía
`scripts/sync-concesiones.py`, sin pasar por estas rutas.

Como `src/app/mapa/page.tsx` ya exige sesión (`if (!user) redirect('/login')`),
se optó por **requerir sesión de usuario autenticado** (`supabase.auth.getUser()`,
mismo patrón que `src/app/api/admin/users/*`) en vez de un secreto compartido
tipo `BOLETIN_SYNC_SECRET`: ese patrón es para llamadas servidor→servidor
(cron→API) y un secreto en código de navegador quedaría expuesto en el
bundle/Network tab, sin proteger nada real. El chequeo va al inicio de cada
`GET`, antes de cualquier fetch externo o escritura — no requiere rol admin,
solo sesión válida. No se tocaron tablas, columnas, políticas RLS ni SQL.

Revisión de seguridad (`security-review` skill) sobre el diff real de ambos
archivos: sin hallazgos — cambio de hardening puro, sin superficie de ataque
nueva.
