import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Agrupa por expediente_key, no por nombre — ver docs/plan-etapas-tramite.md
// sección A. `nombre` sigue siendo el punto de entrada (es lo único que trae
// el feature clickeado en /mapa), pero un mismo nombre puede corresponder a
// varios trámites distintos (titulares/regiones distintas) — `titular` (query
// param opcional) desambigua cuál de esos expedientes es el que corresponde.
export async function GET(req: NextRequest) {
  const nombre = req.nextUrl.searchParams.get('nombre')
  const titular = req.nextUrl.searchParams.get('titular')
  if (!nombre) return NextResponse.json([])

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('boletin_publicaciones')
    .select('*')
    .ilike('nombre', nombre)
    .order('fecha', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json([], { status: 500 })
  const candidatos = data ?? []
  if (candidatos.length <= 1) return NextResponse.json(candidatos)

  // Elegir la expediente_key "objetivo": la del candidato cuyo titular matchea
  // (si vino el param), si no la del más reciente (ya viene ordenado desc).
  const porTitular = titular
    ? candidatos.find((c: any) => (c.titular ?? '').toLowerCase().trim() === titular.toLowerCase().trim())
    : null
  const targetKey = (porTitular ?? candidatos[0]).expediente_key

  // Si algún candidato todavía no tiene expediente_key (no debería pasar tras
  // el backfill + sync/parse actualizados, pero por robustez) se incluye igual
  // en vez de perderlo silenciosamente.
  const filtrados = candidatos.filter((c: any) => !c.expediente_key || c.expediente_key === targetKey)

  return NextResponse.json(filtrados.slice(0, 20))
}
