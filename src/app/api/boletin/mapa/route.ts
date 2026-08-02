import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// WGS84 inverse transverse Mercator (PSAD56≈WGS84 within ~20m for map display)
function utmToLatLng(norte: number, este: number, huso: number): [number, number] | null {
  try {
    const a  = 6378137.0
    const f  = 1 / 298.257223563
    const b  = a * (1 - f)
    const e2 = 1 - (b * b) / (a * a)
    const k0 = 0.9996
    const E0 = 500000
    const N0 = 10000000

    const x = este - E0
    const y = norte - N0
    const lon0 = ((huso - 1) * 6 - 180 + 3) * (Math.PI / 180)

    const M   = y / k0
    const mu  = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256))
    const e1  = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
    const phi1 = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
      + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu)

    const sin1 = Math.sin(phi1)
    const cos1 = Math.cos(phi1)
    const tan1 = sin1 / cos1
    const N1   = a / Math.sqrt(1 - e2 * sin1 * sin1)
    const T1   = tan1 * tan1
    const C1   = (e2 / (1 - e2)) * cos1 * cos1
    const R1   = a * (1 - e2) / Math.pow(1 - e2 * sin1 * sin1, 1.5)
    const D    = x / (N1 * k0)

    const lat = phi1 - (N1 * tan1 / R1) * (
      D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2 / (1 - e2)) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 / (1 - e2) - 3 * C1 * C1) * Math.pow(D, 6) / 720
    )
    const lon = lon0 + (
      D
      - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 / (1 - e2) + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / cos1

    const latDeg = lat * 180 / Math.PI
    const lonDeg = lon * 180 / Math.PI

    // Sanity check: must be within Chile's bounding box
    if (latDeg < -56 || latDeg > -17 || lonDeg < -76 || lonDeg > -65) return null
    return [latDeg, lonDeg]
  } catch {
    return null
  }
}

export async function GET() {
  const admin = createAdminClient()

  // Get the most recent record per concesion name that has coordinates
  const { data, error } = await (admin
    .from('boletin_publicaciones')
    .select('nombre, titular, categoria, fecha, norte, este, alto, ancho, huso, area_ha, region, provincia, conservador, inscripcion_fs, juzgado, causa_rol')
    .not('norte', 'is', null)
    .not('este', 'is', null)
    .not('huso', 'is', null)
    .not('alto', 'is', null)
    .not('ancho', 'is', null)
    .eq('pdf_parsed', true)
    .order('fecha', { ascending: false })
    .limit(500) as any)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate by nombre — keep most recent
  const seen = new Set<string>()
  const features: any[] = []

  for (const row of ((data ?? []) as any[])) {
    const key = (row.nombre ?? '').toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)

    const norte = Number(row.norte)
    const este  = Number(row.este)
    const alto  = Number(row.alto)
    const ancho = Number(row.ancho)
    const huso  = Number(row.huso)

    // Compute 4 corners of the mining rectangle (UTM)
    // L1=NW, L2=NE, L3=SE, L4=SW
    const corners: Array<[number, number]> = [
      [norte,        este],           // L1 NW
      [norte,        este + ancho],   // L2 NE
      [norte - alto, este + ancho],   // L3 SE
      [norte - alto, este],           // L4 SW
    ]

    const wgs: Array<[number, number]> = []
    let valid = true
    for (const [n, e] of corners) {
      const pt = utmToLatLng(n, e, huso)
      if (!pt) { valid = false; break }
      wgs.push(pt)
    }
    if (!valid) continue

    // GeoJSON polygon: [lng, lat] order, close the ring
    const coords = [...wgs.map(([lat, lng]) => [lng, lat]), [wgs[0][1], wgs[0][0]]]

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: {
        NOMBRE:     row.nombre,
        TITULAR:    row.titular,
        CATEGORIA:  row.categoria,
        FECHA:      row.fecha,
        AREA_HA:    row.area_ha,
        REGION:     row.region,
        PROVINCIA:  row.provincia,
        HUSO:       huso,
        // These mark the feature as boletín-only (no SERNAGEOMIN data)
        _source:    'boletin',
      },
    })
  }

  return NextResponse.json(
    { type: 'FeatureCollection', features },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } },
  )
}
