// Etapa del trámite (Manifestación → Mensura → Sentencia → Inscripción CBR).
// Isomorfo (sin dependencias de cliente ni de servidor) para que la misma
// lógica corra tanto en el stepper de /mapa (MapClient.tsx) como en el
// upsert server-side de la tabla `expedientes` (src/lib/expedientes.ts) —
// dos cálculos distintos del mismo resultado divergirían con el tiempo.
// Ver docs/plan-etapas-tramite.md secciones A y B.

export type CronologiaDoc = Record<string, string | null>

export const ETAPAS = [
  { id: 'manifestacion', label: 'Manifestación',  dateKeys: ['manifestacion_publicacion', 'manifestacion_inscripcion', 'manifestacion_orden', 'manifestacion_presentac'] },
  { id: 'mensura',       label: 'Mensura',         dateKeys: ['mensura_publicacion', 'mensura_solicitud'] },
  { id: 'sentencia',     label: 'Sentencia',       dateKeys: ['sentencia_fecha'] },
  { id: 'inscripcion',   label: 'Inscripción CBR', dateKeys: [] as string[] },
] as const

export type EtapaId = (typeof ETAPAS)[number]['id']

// Combina el JSON `doc` (cronología) de TODAS las publicaciones del trámite —
// cada etapa (manifestación/mensura/sentencia) suele llegar en un boletín distinto,
// así que una sola publicación casi nunca trae la cronología completa.
export function mergeCronologia(pubs: { doc?: string | null }[]): CronologiaDoc {
  const cron: CronologiaDoc = {}
  for (const p of [...pubs].reverse()) { // más antigua → más nueva, para que la más reciente gane si hay choque
    let d: Record<string, any> = {}
    try { d = p.doc ? JSON.parse(p.doc) : {} } catch { /* doc corrupto o no-JSON, se ignora */ }
    for (const k of Object.keys(d)) {
      if (d[k] != null && String(d[k]).trim() !== '') cron[k] = d[k]
    }
  }
  return cron
}

// Etapa alcanzada = la última con evidencia, combinando categorías del boletín
// (más confiable, siempre presente) con las fechas de la cronología (más detalle).
// Devuelve el índice en ETAPAS, o -1 si no hay evidencia de ninguna etapa.
export function etapaActualIdx(
  cron: CronologiaDoc,
  cats: string[],
  latest: { inscripcion_fs?: string | null; inscripcion_date?: string | null } | null | undefined
): number {
  const has = (needle: string) => cats.some(c => c.includes(needle))
  const reached = [
    has('PEDIMENTO') || has('MANIFESTAC') || Boolean(cron.manifestacion_presentac || cron.manifestacion_orden || cron.manifestacion_inscripcion || cron.manifestacion_publicacion),
    has('MENSURA')   || Boolean(cron.mensura_solicitud || cron.mensura_publicacion),
    has('SENTENCIA') || Boolean(cron.sentencia_fecha),
    has('INSCRIPCION') || has('INSCRIPCIÓN') || Boolean(latest?.inscripcion_fs || latest?.inscripcion_date),
  ]
  let idx = -1
  reached.forEach((r, i) => { if (r) idx = i })
  return idx
}

/** Atajo: id de la etapa alcanzada (o null si no hay evidencia de ninguna). */
export function etapaActualId(
  cron: CronologiaDoc,
  cats: string[],
  latest: { inscripcion_fs?: string | null; inscripcion_date?: string | null } | null | undefined
): EtapaId | null {
  const idx = etapaActualIdx(cron, cats, latest)
  return idx >= 0 ? ETAPAS[idx].id : null
}
