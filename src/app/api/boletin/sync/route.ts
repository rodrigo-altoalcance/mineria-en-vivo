import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SYNC_SECRET = process.env.BOLETIN_SYNC_SECRET

// Subsecciones conocidas del Boletín Oficial de Minería
const CATEGORIAS = [
  { subseccion: 7100, nombre: 'Manifestación Minera' },
  { subseccion: 7101, nombre: 'Solicitud de Mensura' },
  { subseccion: 7112, nombre: 'Prórroga Exploración' },
]

const BASE_URL = 'https://www.boletinoficialdemineria.cl'

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

function cleanText(s: string): string {
  return decodeHtml(stripTags(s))
}

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

function parsePage(html: string, categoria: string): { entries: BoletinEntry[]; fecha: string; edicion: number } {
  // Extract edition number and date from page
  const edicionMatch = html.match(/Edici[oó]n\s+N[uú]m\.?\s*([\d\.]+)/i)
  const edicion = edicionMatch ? parseInt(edicionMatch[1].replace(/\./g, '')) : 0

  // Try to parse date from page header (e.g., "Jueves 30 de Julio de 2026")
  const MESES: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  }
  let fecha = new Date().toISOString().split('T')[0]
  const dateMatch = html.match(/(\d{1,2})\s+de\s+([A-Za-záéíóú]+)\s+de\s+(\d{4})/i)
  if (dateMatch) {
    const mes = MESES[dateMatch[2].toLowerCase()]
    if (mes) {
      fecha = `${dateMatch[3]}-${mes}-${dateMatch[1].padStart(2, '0')}`
    }
  }

  // Remove script/style blocks
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  // Extract all block-level elements in DOM order
  const blocks = [...clean.matchAll(/<(p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)]

  const entries: BoletinEntry[] = []
  let region: string | null = null
  let provincia: string | null = null
  let pendingNombre = ''
  let pendingTitular: string | null = null

  for (const [, , content] of blocks) {
    const text = cleanText(content)
    if (!text) continue

    const upper = text.toUpperCase()

    // Region header
    if (upper.match(/^REGI[OÓ]N\s+(DE[L]?|DEL)\s/)) {
      region = text
      provincia = null
      pendingNombre = ''
      continue
    }

    // Province header
    if (text.toLowerCase().startsWith('provincia de ') || text.toLowerCase().startsWith('provincia del ')) {
      provincia = text
      pendingNombre = ''
      continue
    }

    // PDF link row
    if (text.startsWith('Ver PDF') || text.includes('Ver PDF')) {
      const urlMatch = content.match(/href="([^"]+)"/i)
      const cveMatch = text.match(/CVE-?(\d+)/i)
      if (pendingNombre) {
        entries.push({
          fecha,
          edicion,
          categoria,
          nombre: pendingNombre,
          titular: pendingTitular,
          region,
          provincia,
          cve: cveMatch?.[1] ?? null,
          url_pdf: urlMatch?.[1] ?? null,
        })
        pendingNombre = ''
        pendingTitular = null
      }
      continue
    }

    // Entry row: "Nombre / Titular"
    if (text.includes(' / ')) {
      const idx = text.indexOf(' / ')
      pendingNombre = text.slice(0, idx).trim()
      pendingTitular = text.slice(idx + 3).trim() || null
    }
  }

  return { entries, fecha, edicion }
}

async function scrapeCategoria(subseccion: number, nombre: string): Promise<BoletinEntry[]> {
  const url = `${BASE_URL}/?subseccion=${subseccion}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MinenBot/1.0)' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching subseccion ${subseccion}`)
  const html = await res.text()
  const { entries, fecha, edicion } = parsePage(html, nombre)
  return entries
}

async function runSync(): Promise<{ total: number; inserted: number; fecha: string }> {
  const admin = createAdminClient()

  const allEntries: BoletinEntry[] = []
  for (const cat of CATEGORIAS) {
    const entries = await scrapeCategoria(cat.subseccion, cat.nombre)
    allEntries.push(...entries)
  }

  if (allEntries.length === 0) {
    return { total: 0, inserted: 0, fecha: new Date().toISOString().split('T')[0] }
  }

  const fecha = allEntries[0].fecha

  // Upsert: skip CVEs already in DB, insert new ones
  const { data, error } = await admin
    .from('boletin_publicaciones')
    .upsert(allEntries, { onConflict: 'cve', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(error.message)

  return { total: allEntries.length, inserted: data?.length ?? 0, fecha }
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
    const result = await runSync()
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
