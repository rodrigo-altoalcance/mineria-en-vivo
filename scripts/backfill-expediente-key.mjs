#!/usr/bin/env node
/**
 * backfill-expediente-key.mjs — Calcula expediente_key para todas las filas
 * existentes de boletin_publicaciones (paso A del plan, ver
 * docs/plan-etapas-tramite.md). Clave fuerte (rol+juzgado) si ya están
 * parseados, clave débil (nombre+titular+region) si no.
 *
 * La lógica de slugify/computeExpedienteKey está duplicada a propósito desde
 * src/lib/expedienteKey.ts (ese archivo es TS, este script corre con `node`
 * plano sin transpilar) — si tocás una, tocá la otra, tienen que dar
 * exactamente el mismo resultado byte a byte o las filas viejas y nuevas
 * quedan agrupadas distinto para el mismo trámite.
 *
 * Uso:
 *   node scripts/backfill-expediente-key.mjs           # solo filas sin expediente_key
 *   node scripts/backfill-expediente-key.mjs --todas    # recalcula todas (idempotente)
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

// ── misma lógica que src/lib/expedienteKey.ts ──────────────────────────────
function slugify(s) {
  if (!s) return ''
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function computeExpedienteKey({ nombre, titular, region, causa_rol, juzgado }) {
  const rol = slugify(causa_rol)
  const jz = slugify(juzgado)
  if (rol && jz) return { key: `rol:${jz}:${rol}`, strong: true }
  return { key: `nombre:${slugify(nombre)}:${slugify(titular)}:${slugify(region)}`, strong: false }
}
// ─────────────────────────────────────────────────────────────────────────

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS })
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

async function sbPatch(id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/boletin_publicaciones?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`PATCH ${id} -> HTTP ${res.status}: ${await res.text()}`)
}

async function pMapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

async function main() {
  const todas = process.argv.includes('--todas')
  const PAGE = 1000
  let offset = 0
  let total = 0
  let updated = 0
  let strong = 0

  for (;;) {
    // Modo default (filtro is.null): SIN offset — cada fila que se actualiza deja
    // de matchear el filtro y desaparece del set, así que "la próxima página" es
    // siempre la primera; paginar con offset acá saltaría filas (bug ya visto: se
    // detuvo en 2000/3643 la primera corrida). Modo --todas: el set no cambia de
    // tamaño (sin filtro), ahí sí offset es seguro.
    const filtro = todas ? '' : '&expediente_key=is.null'
    const paginaOffset = todas ? offset : 0
    const rows = await sbGet(
      `boletin_publicaciones?select=id,nombre,titular,region,causa_rol,juzgado,expediente_key` +
      `${filtro}&order=id&limit=${PAGE}&offset=${paginaOffset}`
    )
    if (!rows.length) break
    total += rows.length

    await pMapLimit(rows, 10, async (row) => {
      const result = computeExpedienteKey(row)
      if (row.expediente_key === result.key) return // ya está correcto, no golpear la DB de gusto
      await sbPatch(row.id, { expediente_key: result.key })
      updated++
      if (result.strong) strong++
    })

    console.log(`[offset ${paginaOffset}] procesadas ${rows.length} (acumulado: ${total})`)
    offset += PAGE
  }

  console.log(`\n✓ ${total} filas revisadas, ${updated} actualizadas (${strong} con clave fuerte rol+juzgado)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
