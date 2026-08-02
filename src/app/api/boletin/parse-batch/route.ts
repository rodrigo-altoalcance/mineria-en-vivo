import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYNC_SECRET = process.env.BOLETIN_SYNC_SECRET

function isAuthorized(req: NextRequest): boolean {
  if (!SYNC_SECRET) return false
  const header = req.headers.get('x-sync-secret')
  const param  = req.nextUrl.searchParams.get('secret')
  return header === SYNC_SECRET || param === SYNC_SECRET
}

async function downloadPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      'Referer':    'https://www.boletinoficialdemineria.cl/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const PROMPT = `Eres un asistente especializado en extraer datos de publicaciones del Boletín Oficial de Minería de Chile.

Extrae los siguientes campos. Si un campo no está, devuelve null. Responde SOLO con JSON válido:

{
  "juzgado": "nombre completo del juzgado",
  "causa_rol": "código causa (ej: V-2920-2023)",
  "conservador": "ciudad del Conservador de Bienes Raíces",
  "inscripcion_fs": "Fojas y Número (ej: Fjs: 1540 N°: 1495)",
  "inscripcion_date": año_como_número,
  "area_ha": hectáreas_como_número,
  "norte": coordenada_norte_L1_como_número,
  "este": coordenada_este_L1_como_número,
  "alto": diferencia_norte_L1_menos_L4_como_número,
  "ancho": diferencia_este_L2_menos_L1_como_número,
  "huso": número_de_huso_utm_entero,
  "orden": "número de orden o null",
  "observaciones": "resumen breve con titular, RUT, tipo de concesión y ubicación",
  "cronologia": {
    "manifestacion_presentac": "DD-MM-YYYY o null",
    "manifestacion_orden": "DD-MM-YYYY o null",
    "manifestacion_inscripcion": "DD-MM-YYYY o null",
    "manifestacion_publicacion": "DD-MM-YYYY o null",
    "mensura_solicitud": "DD-MM-YYYY o null",
    "mensura_publicacion": "DD-MM-YYYY o null",
    "sentencia_fecha": "DD-MM-YYYY o null",
    "plazo_mensura": "DD-MM-YYYY o null",
    "plazo_vigencia": "DD-MM-YYYY o null"
  }
}

Para "huso": busca el número de huso UTM (ej: "Huso 19", "Huso 18"). En Chile norte suele ser 19, centro-sur suele ser 18. Extrae el número entero.`

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50)

  const admin     = createAdminClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Get unparsed records with a PDF URL
  const { data: records, error } = await admin
    .from('boletin_publicaciones')
    .select('id, nombre, cve, url_pdf')
    .eq('pdf_parsed', false)
    .not('url_pdf', 'is', null)
    .order('fecha', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!records?.length) return NextResponse.json({ ok: true, processed: 0, message: 'Todo procesado' })

  const results: { nombre: string; cve: string; ok: boolean; error?: string }[] = []

  for (const pub of records) {
    try {
      const pdfBuffer = await downloadPdf(pub.url_pdf!)

      const message = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
            { type: 'text', text: PROMPT },
          ],
        }],
      })

      const raw  = (message.content[0] as any).text?.trim() ?? ''
      const json = raw.match(/\{[\s\S]*\}/)
      if (!json) throw new Error('Sin JSON en respuesta')
      const extracted = JSON.parse(json[0])
      const { cronologia, ...rest } = extracted

      await admin
        .from('boletin_publicaciones')
        .update({
          pdf_parsed:       true,
          juzgado:          rest.juzgado         ?? null,
          causa_rol:        rest.causa_rol        ?? null,
          conservador:      rest.conservador      ?? null,
          inscripcion_fs:   rest.inscripcion_fs   ?? null,
          inscripcion_date: rest.inscripcion_date ?? null,
          area_ha:          rest.area_ha          ?? null,
          norte:            rest.norte            ?? null,
          este:             rest.este             ?? null,
          alto:             rest.alto             ?? null,
          ancho:            rest.ancho            ?? null,
          huso:             rest.huso             ?? null,
          orden:            rest.orden            ?? null,
          observaciones:    rest.observaciones    ?? null,
          doc:              cronologia ? JSON.stringify(cronologia) : null,
        } as any)
        .eq('id', pub.id)

      results.push({ nombre: pub.nombre, cve: pub.cve ?? '', ok: true })
    } catch (e) {
      // Mark as parsed even on error to avoid infinite retries, log the error
      await admin
        .from('boletin_publicaciones')
        .update({ pdf_parsed: true, observaciones: `Error: ${String(e).slice(0, 200)}` } as any)
        .eq('id', pub.id)
      results.push({ nombre: pub.nombre, cve: pub.cve ?? '', ok: false, error: String(e).slice(0, 100) })
    }
  }

  const ok  = results.filter(r => r.ok).length
  const err = results.filter(r => !r.ok).length
  return NextResponse.json({ ok: true, processed: results.length, success: ok, errors: err, results })
}
