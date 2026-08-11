// Materializa la tabla `expedientes` — una fila por expediente_key con la
// cronología ya mergeada y la etapa ya calculada, en vez de recalcularse en
// cada request (como hoy hace MapClient.tsx al abrir el modal). Se llama
// desde parse-pdf/parse-batch después de actualizar boletin_publicaciones
// (y de reconciliar expediente_key entre filas hermanas — ver src/lib/
// expedienteKey.ts). Ver docs/plan-etapas-tramite.md sección B.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ETAPAS, mergeCronologia, etapaActualIdx } from './etapaTramite'

// Campos "planos" (no-cronología): se toman del documento MÁS RECIENTE del
// expediente, NO se mergean entre todos — igual que MapClient.tsx (`latest =
// pubs[0]`, ver /api/boletin/concesion). Importa sobre todo para
// inscripcion_fs/inscripcion_date: ese campo también aparece en documentos de
// etapas tempranas (ej. la manifestación tiene su propia inscripción en el
// Conservador de Minas, un trámite distinto a la inscripción CBR final) — si
// se mergeara "el no-nulo más reciente" en vez de "el del doc más reciente",
// una inscripción vieja de la manifestación puede filtrarse y hacer creer que
// el expediente ya llegó a la etapa Inscripción CBR cuando en realidad está
// recién en Sentencia. Confirmado con FRANCISCA FERNANDA 1/30 contra el modal
// real de /mapa (ver commit).
const FLAT_FIELDS = [
  'nombre', 'titular', 'region', 'comuna', 'juzgado', 'causa_rol',
  'conservador', 'inscripcion_fs', 'inscripcion_date', 'area_ha',
] as const

export async function upsertExpediente(admin: SupabaseClient<any>, expedienteKey: string | null | undefined): Promise<void> {
  if (!expedienteKey) return

  const { data: pubs, error } = await admin
    .from('boletin_publicaciones')
    .select('nombre,titular,region,comuna,juzgado,causa_rol,conservador,inscripcion_fs,inscripcion_date,area_ha,categoria,doc,fecha')
    .eq('expediente_key', expedienteKey)
    .order('fecha', { ascending: true })

  if (error || !pubs?.length) return

  const latestPub = pubs[pubs.length - 1] as any // pubs viene ascendente por fecha
  const flat: Record<string, string | null> = {}
  for (const f of FLAT_FIELDS) flat[f] = latestPub[f] ?? null

  const cron = mergeCronologia(pubs as any)
  const cats = (pubs as any[]).map(p => (p.categoria || '').toUpperCase())
  const latest = { inscripcion_fs: flat.inscripcion_fs, inscripcion_date: flat.inscripcion_date }
  const idx = etapaActualIdx(cron, cats, latest)
  const etapaActual = idx >= 0 ? ETAPAS[idx].id : null

  // ¿Cambió de etapa respecto a lo ya guardado? Se compara contra la fila
  // existente ANTES de sobrescribir, para que etapa_anterior/etapa_cambiada_at
  // sean una bitácora real y no se reseteen cada vez que se reprocesa un PDF
  // (el LLM no es determinista — un re-parse puede correr sin que la etapa
  // real haya cambiado).
  const { data: existing } = await admin
    .from('expedientes')
    .select('etapa_actual')
    .eq('expediente_key', expedienteKey)
    .maybeSingle()

  const payload: Record<string, any> = {
    expediente_key: expedienteKey,
    nombre: flat.nombre,
    titular: flat.titular,
    region: flat.region,
    comuna: flat.comuna,
    juzgado: flat.juzgado,
    causa_rol: flat.causa_rol,
    conservador: flat.conservador,
    inscripcion_fs: flat.inscripcion_fs,
    inscripcion_date: flat.inscripcion_date,
    area_ha: flat.area_ha,
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
    publicaciones_count: pubs.length,
    updated_at: new Date().toISOString(),
  }

  if (!existing) {
    // Primera vez que se materializa este expediente.
    payload.etapa_anterior = null
    payload.etapa_cambiada_at = etapaActual ? new Date().toISOString() : null
  } else if (existing.etapa_actual !== etapaActual) {
    payload.etapa_anterior = existing.etapa_actual
    payload.etapa_cambiada_at = new Date().toISOString()
  }
  // si no cambió de etapa, no se tocan etapa_anterior/etapa_cambiada_at (quedan como estaban)

  await admin.from('expedientes').upsert(payload, { onConflict: 'expediente_key' })
}
