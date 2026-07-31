import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  const nombre = req.nextUrl.searchParams.get('nombre')
  if (!nombre) return NextResponse.json(null)

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_concesion_centroid`, {
      method: 'POST',
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ search_nombre: nombre }),
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json(null)
    const data = await res.json()
    return NextResponse.json(data ?? null)
  } catch {
    return NextResponse.json(null)
  }
}
