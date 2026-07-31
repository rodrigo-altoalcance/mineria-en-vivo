import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')?.split(',').map(Number)
  if (!bbox || bbox.length !== 4 || bbox.some(isNaN)) {
    return NextResponse.json({ type: 'FeatureCollection', features: [], source: 'error' })
  }

  const [west, south, east, north] = bbox

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_concesiones_bbox`, {
      method: 'POST',
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        bbox_west: west, bbox_south: south,
        bbox_east: east, bbox_north: north,
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json(
        { type: 'FeatureCollection', features: [], source: 'db_error' },
        { status: 200 }
      )
    }

    const features = await res.json()

    // Si no hay datos en la tabla todavía (< 100 filas), indicar al cliente
    // que haga fallback a SERNAGEOMIN
    const source = Array.isArray(features) && features.length === 0
      ? 'empty'       // puede ser tabla vacía o área sin concesiones
      : 'supabase'

    return NextResponse.json(
      {
        type:     'FeatureCollection',
        features: Array.isArray(features) ? features : [],
        source,
      },
      {
        headers: {
          // Cache de 5 minutos — los datos cambian poco
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      }
    )
  } catch {
    return NextResponse.json(
      { type: 'FeatureCollection', features: [], source: 'db_error' },
      { status: 200 }
    )
  }
}
