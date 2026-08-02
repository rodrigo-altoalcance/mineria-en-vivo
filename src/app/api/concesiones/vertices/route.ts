import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const FS0 = 'https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/0'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    const url = `${FS0}/query?where=ID_CONCESION='${encodeURIComponent(id)}'&outFields=NORTE,ESTE,NOMBRE&orderByFields=NOMBRE&f=json`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`FS0 HTTP ${res.status}`)

    const json = await res.json()
    const vertices = (json.features ?? []).map((f: any) => ({
      n: f.attributes.NOMBRE,
      norte: f.attributes.NORTE,
      este: f.attributes.ESTE,
    }))

    return NextResponse.json(vertices)
  } catch (err) {
    return NextResponse.json([], { status: 200 })
  }
}
