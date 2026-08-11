import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeExpedienteKey } from '@/lib/expedienteKey'

const SYNC_SECRET = process.env.BOLETIN_SYNC_SECRET
const BASE = 'https://www.boletinoficialdemineria.cl'

// Subsecciones disponibles en el sidebar de boletinoficialdemineria.cl
const SUBSECCIONES = [7100, 7101, 7112]

interface BoletinEntry {
  fecha: string
  edicion: number
  categoria: string
  nombre: string
  titular: string | null
  region: string | null
  provincia: string | null
  cve: string | null
  url_pdf: string | null
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

const cleanText = (s: string) => decodeHtml(stripTags(s))

/**
 * HTML structure of boletinoficialdemineria.cl:
 *   <table>
 *     <tr><td class="title3"> PEDIMENTOS MINEROS </td></tr>   ← categoría
 *     <tr><td class="title4">REGIÓN DE ...</td></tr>          ← región
 *     <tr><td class="title5">Provincia de ...</td></tr>       ← provincia
 *     <tr class="content">
 *       <td>NOMBRE / Titular <span ...></td>
 *       <td><a href="...pdf">Ver PDF (CVE-NNNN)</a></td>
 *     </tr>
 *   </table>
 */
function parsePage(html: string): { entries: BoletinEntry[]; fecha: string; edicion: number } {
  // Extract edition number from any link: ?edition=44512
  const edicionMatch = html.match(/edition=(\d+)/i)
  const edicion = edicionMatch ? parseInt(edicionMatch[1]) : 0

  // Extract date from link: ?date=30-07-2026
  let fecha = new Date().toISOString().split('T')[0]
  const dateUrlMatch = html.match(/date=(\d{2}-\d{2}-\d{4})/)
  if (dateUrlMatch) {
    const [d, m, y] = dateUrlMatch[1].split('-')
    fecha = `${y}-${m}-${d}`
  }

  // Remove noise
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  // Parse all <tr> blocks
  const rows = [...clean.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)]

  const entries: BoletinEntry[] = []
  let categoria = ''
  let region: string | null = null
  let provincia: string | null = null

  for (const [, trAttrs, trContent] of rows) {
    // Category header (title3)
    const t3 = trContent.match(/<td[^>]*class="[^"]*title3[^"]*"[^>]*>([\s\S]*?)<\/td>/i)
    if (t3) {
      categoria = cleanText(t3[1])
      region = null
      provincia = null
      continue
    }

    // Region header (title4)
    const t4 = trContent.match(/<td[^>]*class="[^"]*title4[^"]*"[^>]*>([\s\S]*?)<\/td>/i)
    if (t4) {
      region = cleanText(t4[1])
      provincia = null
      continue
    }

    // Province header (title5)
    const t5 = trContent.match(/<td[^>]*class="[^"]*title5[^"]*"[^>]*>([\s\S]*?)<\/td>/i)
    if (t5) {
      provincia = cleanText(t5[1])
      continue
    }

    // Entry row (class="content")
    if (/\bclass="[^"]*\bcontent\b/.test(trAttrs) && categoria) {
      const tds = [...trContent.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      if (tds.length >= 2) {
        const nameOwner = cleanText(tds[0][2])
        const pdfCell = tds[1][2]
        const urlMatch = pdfCell.match(/href="([^"]+)"/i)
        const cveMatch = cleanText(pdfCell).match(/CVE-?(\d+)/i)

        const slashIdx = nameOwner.indexOf(' / ')
        entries.push({
          fecha,
          edicion,
          categoria,
          nombre: slashIdx >= 0 ? nameOwner.slice(0, slashIdx).trim() : nameOwner,
          titular: slashIdx >= 0 ? nameOwner.slice(slashIdx + 3).trim() || null : null,
          region,
          provincia,
          cve: cveMatch?.[1] ?? null,
          url_pdf: urlMatch?.[1] ?? null,
        })
      }
    }
  }

  return { entries, fecha, edicion }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MinenBot/1.0)' },
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`)
  return res.text()
}

async function runSync(targetDate?: string): Promise<{ total: number; inserted: number; fecha: string; edicion: number }> {
  const admin = createAdminClient()

  // 1. Fetch homepage (or date-specific page) to discover edition number
  let discoveryUrl = BASE + '/'
  if (targetDate) {
    const [y, m, d] = targetDate.split('-')
    discoveryUrl = `${BASE}/?date=${d}-${m}-${y}`
  }
  const homeHtml = await fetchHtml(discoveryUrl)
  const { fecha, edicion } = parsePage(homeHtml)

  if (!edicion) throw new Error('No se pudo obtener el número de edición del boletín')

  // Use targetDate if provided, else what the page reports
  const syncFecha = targetDate ?? fecha

  // 2. Build the date string for URLs (DD-MM-YYYY)
  const [y, m, d] = syncFecha.split('-')
  const dateParam = `${d}-${m}-${y}`

  // 3. Scrape main page (pedimentos) + each subseccion
  const urls = [
    `${BASE}/?date=${dateParam}&edition=${edicion}`,
    ...SUBSECCIONES.map(s => `${BASE}/?date=${dateParam}&edition=${edicion}&subseccion=${s}`),
  ]

  const allEntries: BoletinEntry[] = []
  const seenCves = new Set<string>()

  for (const url of urls) {
    try {
      const html = await fetchHtml(url)
      const { entries } = parsePage(html)
      for (const e of entries) {
        // Dedup by CVE within this sync batch
        if (e.cve) {
          if (seenCves.has(e.cve)) continue
          seenCves.add(e.cve)
        }
        allEntries.push(e)
      }
    } catch (err) {
      console.warn(`[boletin/sync] Error fetching ${url}:`, err)
    }
  }

  if (allEntries.length === 0) {
    return { total: 0, inserted: 0, fecha: syncFecha, edicion }
  }

  // 4. Fetch CVEs already stored for this date to avoid duplicates
  const { data: existing } = await admin
    .from('boletin_publicaciones')
    .select('cve')
    .eq('fecha', syncFecha)
    .not('cve', 'is', null)

  const existingCves = new Set((existing ?? []).map((r: { cve: string | null }) => r.cve))

  const newEntries = allEntries.filter(e => !e.cve || !existingCves.has(e.cve))

  if (newEntries.length === 0) {
    return { total: allEntries.length, inserted: 0, fecha: syncFecha, edicion }
  }

  // 5. Insert only new entries (override fecha to ensure correct date).
  // expediente_key débil (nombre+titular+region) — el listado del sync nunca trae
  // causa_rol/juzgado, así que acá nunca se puede calcular la clave fuerte; se
  // promueve/reconcilia después en parse-pdf/parse-batch cuando el PDF se parsea.
  const { data, error } = await admin
    .from('boletin_publicaciones')
    .insert(newEntries.map(e => ({
      ...e,
      fecha: syncFecha,
      expediente_key: computeExpedienteKey({ nombre: e.nombre, titular: e.titular, region: e.region }).key,
    })))
    .select('id')

  if (error) throw new Error(error.message)

  return { total: allEntries.length, inserted: data?.length ?? 0, fecha: syncFecha, edicion }
}

function isAuthorized(req: Request): boolean {
  if (!SYNC_SECRET) return false
  const header = req.headers.get('x-sync-secret')
  const url = new URL(req.url)
  const param = url.searchParams.get('secret')
  return header === SYNC_SECRET || param === SYNC_SECRET
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const url = new URL(req.url)
    const fecha = url.searchParams.get('fecha') ?? undefined
    const result = await runSync(fecha)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[boletin/sync]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runSync()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[boletin/sync]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
