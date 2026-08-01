import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CACHE_DAYS   = 30

interface Pago {
  periodo:      string
  fecha:        string
  folio:        string
  valor:        string
  hectareas:    string
  pertenencias: string
}

function tipoNum(tipo: string): string {
  return tipo === 'EXPLOTACION' ? '2' : '1'
}

function parsePayments(html: string): Pago[] {
  const rows: Pago[] = []
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) return rows

  for (const trMatch of tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
    if (cells.length >= 5) {
      rows.push({
        periodo:      cells[0],
        fecha:        cells[1],
        folio:        cells[2],
        valor:        cells[3],
        hectareas:    cells[4],
        pertenencias: cells[5] ?? '',
      })
    }
  }
  return rows
}

export async function GET(req: NextRequest) {
  const rolParam = req.nextUrl.searchParams.get('rol')
  const tipo     = req.nextUrl.searchParams.get('tipo') || 'EXPLOTACION'
  if (!rolParam) return NextResponse.json(null)

  const numeroRol = parseInt(rolParam, 10)
  if (isNaN(numeroRol)) return NextResponse.json(null)

  // Revisar caché en Supabase (válida 30 días)
  try {
    const cacheRes = await fetch(
      `${SUPABASE_URL}/rest/v1/concesiones_detalle?numero_rol=eq.${numeroRol}&select=*&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, cache: 'no-store' }
    )
    if (cacheRes.ok) {
      const cached = await cacheRes.json()
      if (cached.length > 0) {
        const daysOld = (Date.now() - new Date(cached[0].scraped_at).getTime()) / 86_400_000
        if (daysOld < CACHE_DAYS) return NextResponse.json(cached[0])
      }
    }
  } catch { /* ignorar error de caché, ir a scraping */ }

  // Scraping desde SERNAGEOMIN
  const rolFmt = String(numeroRol).padStart(9, '0')
  const url    = `https://portalsdnmext.sernageomin.cl/propiedadminera/consulta-pago-query?tipo=${tipoNum(tipo)}&rol=${rolFmt}`

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return NextResponse.json(null)

    const html  = await res.text()
    const pagos = parsePayments(html)

    const detalle = { numero_rol: numeroRol, tipo, pagos, scraped_at: new Date().toISOString() }

    // Guardar en caché
    await fetch(`${SUPABASE_URL}/rest/v1/concesiones_detalle`, {
      method: 'POST',
      headers: {
        apikey:        SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([detalle]),
      cache: 'no-store',
    })

    return NextResponse.json(detalle)
  } catch {
    return NextResponse.json(null)
  }
}
