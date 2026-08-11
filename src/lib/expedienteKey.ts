// Clave de agrupación estable por expediente minero, compartida entre
// boletin/sync (inserción), boletin/parse-pdf y boletin/parse-batch (promoción
// a clave fuerte tras el parseo LLM) y boletin/concesion (lectura para el
// stepper de /mapa). Ver docs/plan-etapas-tramite.md, sección A.
//
// `nombre` NO es una clave confiable para agrupar un trámite — hay concesiones
// distintas con el mismo nombre (mismo titular o no). `causa_rol` + `juzgado`
// sí lo son: son únicos por causa judicial en Chile, pero solo se conocen
// después de parsear el PDF con LLM. Mientras tanto se usa un fallback débil.

/** lowercase, sin tildes/ñ, solo [a-z0-9-], sin guiones repetidos ni en los bordes. */
export function slugify(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes (á→a, ñ→n vía NFD no cubre ñ del todo, ver replace abajo)
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface ExpedienteKeyInput {
  nombre: string | null | undefined
  titular?: string | null
  region?: string | null
  causa_rol?: string | null
  juzgado?: string | null
}

export interface ExpedienteKeyResult {
  key: string
  /** true si viene de causa_rol+juzgado (única por causa judicial); false si es el fallback nombre+titular+region. */
  strong: boolean
}

/**
 * Clave fuerte: `rol:<juzgado>:<causa_rol>` — solo cuando ambos campos existen
 * (se obtienen parseando el PDF, no vienen en el listado del sync).
 * Clave débil (fallback): `nombre:<nombre>:<titular>:<region>` — suficiente para
 * no perder el hilo mientras se espera el parse; se reconcilia a la clave fuerte
 * apenas el parse la revela (ver reconcileExpedienteKey en parse-pdf/parse-batch).
 */
export function computeExpedienteKey(input: ExpedienteKeyInput): ExpedienteKeyResult {
  const rol = slugify(input.causa_rol)
  const juzgado = slugify(input.juzgado)
  if (rol && juzgado) {
    return { key: `rol:${juzgado}:${rol}`, strong: true }
  }
  return {
    key: `nombre:${slugify(input.nombre)}:${slugify(input.titular)}:${slugify(input.region)}`,
    strong: false,
  }
}
