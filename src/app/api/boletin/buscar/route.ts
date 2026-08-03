import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Same UTM→WGS84 as /api/boletin/mapa
function utmToLatLng(norte: number, este: number, huso: number): [number, number] | null {
  try {
    const a  = 6378137.0, f = 1 / 298.257223563, b = a * (1 - f)
    const e2 = 1 - (b * b) / (a * a), k0 = 0.9996
    const x = este - 500000, y = norte - 10000000
    const lon0 = ((huso - 1) * 6 - 180 + 3) * (Math.PI / 180)
    const M = y / k0
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256))
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
    const phi1 = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
    const sin1 = Math.sin(phi1), cos1 = Math.cos(phi1), tan1 = sin1 / cos1
    const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1)
    const T1 = tan1 * tan1, C1 = (e2 / (1 - e2)) * cos1 * cos1
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * sin1 * sin1, 1.5)
    const D  = x / (N1 * k0)
    const lat = phi1 - (N1 * tan1 / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2 / (1 - e2)) * Math.pow(D, 4) / 24)
    const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6) / cos1
    const latDeg = lat * 180 / Math.PI, lonDeg = lon * 180 / Math.PI
    if (latDeg < -56 || latDeg > -17 || lonDeg < -76 || lonDeg > -65) return null
    return [latDeg, lonDeg]
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json([])

  const admin = createAdminClient()
  const { data } = await (admin
    .from('boletin_publicaciones')
    .select('nombre, titular, categoria, fecha, norte, este, huso, area_ha, region, provincia')
    .or(`nombre.ilike.%${q}%,titular.ilike.%${q}%`)
    .not('norte', 'is', null)
    .not('huso', 'is', null)
    .eq('pdf_parsed', true)
    .order('fecha', { ascending: false })
    .limit(10) as any)

  const results = ((data ?? []) as any[]).map((row: any) => {
    const centroid = utmToLatLng(Number(row.norte), Number(row.este), Number(row.huso))
    return {
      nombre:    row.nombre,
      titular:   row.titular,
      categoria: row.categoria,
      fecha:     row.fecha,
      area_ha:   row.area_ha,
      region:    row.region,
      provincia: row.provincia,
      lat:       centroid?.[0] ?? null,
      lng:       centroid?.[1] ?? null,
      _source:   'boletin',
    }
  }).filter((r: any) => r.lat !== null)

  return NextResponse.json(results)
}
