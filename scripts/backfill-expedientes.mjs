#!/usr/bin/env node
/**
 * backfill-expedientes.mjs — Puebla la tabla `expedientes` (paso B del plan,
 * docs/plan-etapas-tramite.md) a partir de TODO lo que ya está en
 * boletin_publicaciones, no solo lo parseado — incluso sin causa_rol/juzgado
 * la categoría del boletín (PEDIMENTO/MANIFESTACIÓN/MENSURA/SENTENCIA) ya basta
 * para calcular una etapa_actual aproximada (ver etapaActualIdx). De acá en
 * adelante el upsert normal lo hacen parse-pdf/parse-batch por expediente —
 * este script es solo la carga inicial, tabla vacía → poblada de una vez.
 *
 * La lógica de mergeCronologia/etapaActualIdx está duplicada a propósito desde
 * src/lib/etapaTramite.ts (igual que expedienteKey en backfill-expediente-key.mjs)
 * — si tocás una, tocá la otra.
 *
 * Uso: node scripts/backfill-expedientes.mjs
 */

import { readFileSync } from 'fs'

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* sin .env.local, se espera que las vars ya estén en el entorno */ }
}
loadEnvLocal()

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// ── misma lógica que src/lib/etapaTramite.ts ────────────────────────────────
const ETAPAS = [
  { id: 'manifestacion', dateKeys: ['manifestacion_publicacion', 'manifestacion_inscripcion', 'manifestacion_orden', 'manifestacion_presentac'] },
  { id: 'mensura',       dateKeys: ['mensura_publicacion', 'mensura_solicitud'] },
  { id: 'sentencia',     dateKeys: ['sentencia_fecha'] },
  { id: 'inscripcion',   dateKeys: [] },
]

function mergeCronologia(pubs) {
  const cron = {}
  for (const p of [...pubs].reverse()) {
    let d = {}
    try { d = p.doc ? JSON.parse(p.doc) : {} } catch { /* doc corrupto, se ignora */ }
    for (const k of Object.keys(d)) {
      if (d[k] != null && String(d[k]).trim() !== '') cron[k] = d[k]
    }
  }
  return cron
}

function etapaActualIdx(cron, cats, latest) {
  const has = (needle) => cats.some((c) => c.includes(needle))
  const reached = [
    has('PEDIMENTO') || has('MANIFESTAC') || Boolean(cron.manifestacion_presentac || cron.manifestacion_orden || cron.manifestacion_inscripcion || cron.manifestacion_publicacion),
    has('MENSURA') || Boolean(cron.mensura_solicitud || cron.mensura_publicacion),
    has('SENTENCIA') || Boolean(cron.sentencia_fecha),
    has('INSCRIPCION') || has('INSCRIPCIÓN') || Boolean(latest?.inscripcion_fs || latest?.inscripcion_date),
  ]
  let idx = -1
  reached.forEach((r, i) => { if (r) idx = i })
  return idx
}
// ─────────────────────────────────────────────────────────────────────────

const FLAT_FIELDS = ['nombre', 'titular', 'region', 'comuna', 'juzgado', 'causa_rol', 'conservador', 'inscripcion_fs', 'inscripcion_date', 'area_ha']

async function sbGetAll(path, pageSize = 1000) {
  const all = []
  let offset = 0
  for (;;) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}&order=fecha.asc&limit=${pageSize}&offset=${offset}`, { headers: HEADERS })
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    all.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return all
}

async function sbUpsert(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/expedientes?on_conflict=expediente_key`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`UPSERT expedientes -> HTTP ${res.status}: ${await res.text()}`)
}

function computeExpedienteRow(expedienteKey, pubs) {
  // Campos planos: del documento MÁS RECIENTE, no mergeados entre todos —
  // igual que MapClient.tsx (`latest = pubs[0]`). Ver el comentario largo en
  // src/lib/expedientes.ts (mismo fix, mismo motivo: inscripcion_fs de una
  // manifestación vieja no debe hacer creer que ya hay Inscripción CBR).
  const latestPub = pubs[pubs.length - 1] // pubs viene ascendente por fecha
  const flat = {}
  for (const f of FLAT_FIELDS) flat[f] = latestPub[f] ?? null

  const cron = mergeCronologia(pubs)
  const cats = pubs.map((p) => (p.categoria || '').toUpperCase())
  const latest = { inscripcion_fs: flat.inscripcion_fs, inscripcion_date: flat.inscripcion_date }
  const idx = etapaActualIdx(cron, cats, latest)
  const etapaActual = idx >= 0 ? ETAPAS[idx].id : null
  const now = new Date().toISOString()

  return {
    expediente_key: expedienteKey,
    ...flat,
    manifestacion_presentac: cron.manifestacion_presentac ?? null,
    manifestacion_orden: cron.manifestacion_orden ?? null,
    manifestacion_inscripcion: cron.manifestacion_inscripcion ?? null,
    manifestacion_publicacion: cron.manifestacion_publicacion ?? null,
    mensura_solicitud: cron.mensura_solicitud ?? null,
    mensura_publicacion: cron.mensura_publicacion ?? null,
    sentencia_fecha: cron.sentencia_fecha ?? null,
    plazo_mensura: cron.plazo_mensura ?? null,
    plazo_vigencia: cron.plazo_vigencia ?? null,
    etapa_actual: etapaActual,
    etapa_anterior: null, // primera carga — no hay historial previo que comparar
    etapa_cambiada_at: etapaActual ? now : null,
    publicaciones_count: pubs.length,
    updated_at: now,
  }
}

async function main() {
  console.log('Descargando boletin_publicaciones...')
  const pubs = await sbGetAll(
    'boletin_publicaciones?select=nombre,titular,region,comuna,juzgado,causa_rol,conservador,inscripcion_fs,inscripcion_date,area_ha,categoria,doc,fecha,expediente_key&expediente_key=not.is.null'
  )
  console.log(`${pubs.length} filas descargadas`)

  const porExpediente = new Map()
  for (const p of pubs) {
    const arr = porExpediente.get(p.expediente_key) ?? []
    arr.push(p)
    porExpediente.set(p.expediente_key, arr)
  }
  console.log(`${porExpediente.size} expedientes distintos`)

  const rows = [...porExpediente.entries()].map(([key, group]) => computeExpedienteRow(key, group))

  const BATCH = 500
  let etapas = { manifestacion: 0, mensura: 0, sentencia: 0, inscripcion: 0, sin_etapa: 0 }
  for (const r of rows) {
    etapas[r.etapa_actual ?? 'sin_etapa']++
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    await sbUpsert(slice)
    console.log(`upsert ${i + slice.length}/${rows.length}`)
  }

  console.log(`\n✓ ${rows.length} expedientes materializados`)
  console.log('  Por etapa:', etapas)
}

main().catch((e) => { console.error(e); process.exit(1) })
