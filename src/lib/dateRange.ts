// Utilidades de rango de fechas para /boletin.
// Compartidas entre el Server Component (src/app/boletin/page.tsx) y el
// picker en cliente (src/app/boletin/BoletinClient.tsx) para que la regla
// de "3 meses" se calcule exactamente igual en ambos lados.

export const RANGO_MAX_MESES = 3

/** Fecha de hoy en formato ISO (YYYY-MM-DD), hora local. */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** `YYYY-MM-DD` válido (no valida que la fecha exista realmente, p.ej. 02-30). */
export function esFechaISO(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/**
 * Suma (o resta, con n negativo) meses calendario a una fecha ISO.
 * Si el mes resultante no tiene ese día (p.ej. 31 de enero + 1 mes),
 * clampa al último día del mes destino — mismo criterio que dayjs/moment.
 */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth()
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, daysInTargetMonth)
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** El "hasta" máximo permitido si "desde" ya está fijado. */
export function maxHastaPara(desde: string): string {
  return addMonths(desde, RANGO_MAX_MESES)
}

/** El "desde" mínimo permitido si "hasta" ya está fijado. */
export function minDesdePara(hasta: string): string {
  return addMonths(hasta, -RANGO_MAX_MESES)
}

/** true si [desde, hasta] excede el máximo de 3 meses calendario, o está invertido. */
export function excedeRangoMaximo(desde: string, hasta: string): boolean {
  if (hasta < desde) return true
  return hasta > maxHastaPara(desde)
}

export interface RangoResuelto {
  desde: string
  hasta: string
  /** true si desde/hasta venían de la URL pero eran inválidos o excedían el máximo, y se recalcularon. */
  corregido: boolean
}

/**
 * Resuelve el rango a consultar a partir de los searchParams de la URL.
 * Válvula de seguridad de backend (no del picker en cliente): si la URL fue
 * editada a mano con un rango inválido o mayor a 3 meses, se recorta para
 * la query — esto NO reemplaza la validación interactiva del picker, que
 * nunca corrige en silencio.
 */
export function resolverRango(
  desdeParam: string | undefined,
  hastaParam: string | undefined,
  fechaMasReciente: string | null,
): RangoResuelto {
  const hastaDefault = fechaMasReciente ?? todayISO()

  const defaultDesde = (() => {
    const d = new Date(hastaDefault + 'T12:00:00')
    d.setDate(d.getDate() - 6)
    return d.toISOString().split('T')[0]
  })()

  if (!esFechaISO(desdeParam) || !esFechaISO(hastaParam)) {
    return { desde: defaultDesde, hasta: hastaDefault, corregido: false }
  }

  if (excedeRangoMaximo(desdeParam, hastaParam)) {
    return { desde: minDesdePara(hastaParam), hasta: hastaParam, corregido: true }
  }

  return { desde: desdeParam, hasta: hastaParam, corregido: false }
}
