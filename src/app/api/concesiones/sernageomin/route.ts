import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 55

const SERNAGEOMIN_BASE =
  'https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query'

// Límite de features que guardamos en cada llamada (evitar JSON gigante en RPC)
const CACHE_BATCH_LIMIT = 150

export async function GET(req: NextRequest) {
  // Requiere sesión de usuario autenticado — /mapa ya exige login, esto solo
  // cierra el endpoint a quien le pegue directo sin cookie de sesión.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bbox  = req.nextUrl.searchParams.get('bbox')
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 2000), 2000)

  if (!bbox) return NextResponse.json({ error: 'bbox required' }, { status: 400 })

  const where = encodeURIComponent(`SITUACION_CONCESION <> 'ELIMINADA'`)
  const url   = `${SERNAGEOMIN_BASE}?where=${where}`
    + `&geometry=${encodeURIComponent(bbox)}`
    + `&geometryType=esriGeometryEnvelope&inSR=4326`
    + `&spatialRel=esriSpatialRelIntersects`
    + `&outFields=*&returnGeometry=true&f=geojson&outSR=4326`
    + `&resultRecordCount=${limit}`

  let geojson: any
  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    geojson   = await res.json()
  } catch {
    return NextResponse.json({ error: 'SERNAGEOMIN unavailable' }, { status: 502 })
  }

  const features: any[] = geojson?.features ?? []

  // Guardar en caché en segundo plano (fire-and-forget, sin bloquear la respuesta)
  if (features.length > 0) {
    const admin   = createAdminClient()
    const toCache = features
      .filter((f: any) => f.geometry && f.properties?.OBJECTID)
      .slice(0, CACHE_BATCH_LIMIT)

    // No await — corre mientras Vercel todavía tiene el contexto activo
    ;(admin as any).rpc('upsert_concesiones_batch', { features: toCache })
      .then(() => { /* silencioso */ })
      .catch(() => { /* silencioso — se reintentará en la próxima carga */ })
  }

  return NextResponse.json(
    { type: 'FeatureCollection', features, source: 'sernageomin' },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
