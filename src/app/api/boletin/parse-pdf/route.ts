import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYNC_SECRET = process.env.BOLETIN_SYNC_SECRET

function isAuthorized(req: NextRequest): boolean {
  if (!SYNC_SECRET) return false
  const header = req.headers.get('x-sync-secret')
  const param = req.nextUrl.searchParams.get('secret')
  return header === SYNC_SECRET || param === SYNC_SECRET
}

// Download PDF with the Referer that diariooficial.interior.gob.cl requires
async function downloadPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      'Referer': 'https://www.boletinoficialdemineria.cl/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  })
  if (!res.ok) throw new Error(`PDF download failed: HTTP ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

const EXTRACTION_PROMPT = `Eres un asistente especializado en extraer datos estructurados de publicaciones del Boletín Oficial de Minería de Chile.

Del documento adjunto, extrae EXACTAMENTE los siguientes campos si están presentes. Si un campo no está en el documento, devuelve null para ese campo.

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con esta estructura:

{
  "juzgado": "nombre completo del juzgado",
  "causa_rol": "código de la causa (ej: V-2920-2023)",
  "conservador": "nombre de la ciudad del Conservador de Bienes Raíces",
  "inscripcion_fs": "Fojas y Número de inscripción (ej: Fjs: 1540 N°: 1495)",
  "inscripcion_date": "año de inscripción (ej: 2023)",
  "area_ha": número_de_hectáreas_como_número,
  "norte": número_coordenada_norte_L1_como_número,
  "este": número_coordenada_este_L1_como_número,
  "alto": diferencia_norte_entre_L1_y_L4_como_número,
  "ancho": diferencia_este_entre_L1_y_L2_como_número,
  "huso": número_de_huso_utm_entero,
  "orden": "número de orden o I/P si existe",
  "observaciones": "cualquier observación relevante adicional",
  "cronologia": {
    "manifestacion_presentac": "fecha DD-MM-YYYY",
    "manifestacion_orden": "fecha DD-MM-YYYY",
    "manifestacion_inscripcion": "fecha DD-MM-YYYY",
    "manifestacion_publicacion": "fecha DD-MM-YYYY",
    "mensura_solicitud": "fecha DD-MM-YYYY",
    "mensura_publicacion": "fecha DD-MM-YYYY",
    "sentencia_fecha": "fecha DD-MM-YYYY",
    "plazo_mensura": "fecha DD-MM-YYYY",
    "plazo_vigencia": "fecha DD-MM-YYYY"
  }
}

Para las coordenadas: busca la tabla con L1, L2, L3, L4 o los vértices del cuadrángulo. El NORTE de L1 es el campo "norte". El ESTE de L1 es el campo "este". El "alto" es la diferencia de Norte entre L1 y L4 (o L2 y L3). El "ancho" es la diferencia de Este entre L1 y L2 (o L3 y L4). Para "huso": busca el número de huso UTM (ej: "Huso 19", "Huso 18"); en Chile norte es típicamente 19, centro-sur es 18.`

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cve = req.nextUrl.searchParams.get('cve')
  const id  = req.nextUrl.searchParams.get('id')

  if (!cve && !id) {
    return NextResponse.json({ error: 'Parámetro cve o id requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Find the publication
  let query = admin.from('boletin_publicaciones').select('*')
  if (cve) query = query.eq('cve', cve)
  else if (id) query = query.eq('id', id)
  const { data: rows, error } = await query.limit(1).single()

  if (error || !rows) {
    return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 })
  }

  const pub = rows as any
  const pdfUrl = pub.url_pdf
  if (!pdfUrl) {
    return NextResponse.json({ error: 'Sin URL de PDF', pub }, { status: 422 })
  }

  // Download PDF
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await downloadPdf(pdfUrl)
  } catch (e) {
    return NextResponse.json({ error: `Error descargando PDF: ${e}` }, { status: 502 })
  }

  // Send to Claude Vision
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let extracted: any
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    })

    const raw = (message.content[0] as any).text?.trim() ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response: ' + raw.slice(0, 200))
    extracted = JSON.parse(jsonMatch[0])
  } catch (e) {
    return NextResponse.json({ error: `Error OCR: ${e}` }, { status: 500 })
  }

  // Build update payload (doc stored as JSON string to avoid column type issues)
  const { cronologia, ...rest } = extracted
  const update: Record<string, any> = {
    pdf_parsed: true,
    juzgado:         rest.juzgado         ?? null,
    causa_rol:       rest.causa_rol        ?? null,
    conservador:     rest.conservador      ?? null,
    inscripcion_fs:  rest.inscripcion_fs   ?? null,
    inscripcion_date: rest.inscripcion_date ?? null,
    area_ha:         rest.area_ha          ?? null,
    norte:           rest.norte            ?? null,
    este:            rest.este             ?? null,
    alto:            rest.alto             ?? null,
    ancho:           rest.ancho            ?? null,
    huso:            rest.huso             ?? null,
    orden:           rest.orden            ?? null,
    observaciones:   rest.observaciones    ?? null,
    doc:             cronologia ? JSON.stringify(cronologia) : null,
  }

  const { error: updateErr } = await admin
    .from('boletin_publicaciones')
    .update(update as any)
    .eq('id', pub.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, extracted }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    nombre: pub.nombre,
    cve: pub.cve,
    extracted,
  })
}
