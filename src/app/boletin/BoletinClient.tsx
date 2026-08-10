'use client'

import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BoletinPublicacion } from '@/types/database'
import AlertDialog from '@/components/ui/AlertDialog'
import { createClient } from '@/lib/supabase/client'
import { excedeRangoMaximo, maxHastaPara, todayISO, RANGO_MAX_MESES } from '@/lib/dateRange'

interface Props {
  publicaciones: BoletinPublicacion[]
  desde: string
  hasta: string
}

const CATEGORIAS_ORDEN = [
  'PEDIMENTOS MINEROS',
  'MANIFESTACIONES MINERAS',
  'SOLICITUDES DE MENSURA',
  'PRÓRROGAS DE CONCESIONES DE EXPLORACIÓN',
  'PRÓRROGAS DE CONCESIONES DE EXPLOTACIÓN',
]

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── Mini-calendario único (un solo popover para "desde" y "hasta") ─────────────
// `maxDate` deshabilita visualmente las celdas fuera del rango permitido —
// SIEMPRE ≤ hoy (nunca se puede seleccionar futuro) y, mientras se espera el
// segundo clic, además acotado al tope de 3 meses (lo calcula el llamador).
// La navegación de mes tampoco puede pasar del mes actual — es una regla
// aparte de `maxDate` (que puede ser más restrictivo si el tope de 3 meses
// cae antes de hoy), así que se controla directamente contra `todayISO()`.
//
// El puntito de "este día tiene publicaciones" se resuelve con una query
// acotada al mes visible (no un fetch global ni la lista de 2000 filas del
// mecanismo original) cada vez que `viewYear`/`viewMonth` cambian.

function Calendario({ desde, hasta, maxDate, onChange }: {
  desde: string
  hasta: string
  maxDate: string
  onChange: (d: string) => void
}) {
  const today = todayISO()

  const init = desde ? new Date(desde + 'T12:00:00') : new Date()
  const [viewYear,  setViewYear]  = useState(init.getFullYear())
  const [viewMonth, setViewMonth] = useState(init.getMonth())

  const [fechasConDatos, setFechasConDatos] = useState<Set<string>>(new Set())

  const firstDow = (() => {
    const d = new Date(viewYear, viewMonth, 1).getDay() - 1
    return d < 0 ? 6 : d
  })()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells: Array<null | { day: number; iso: string }> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      return { day: d, iso }
    }),
  ]

  // Query acotada al mes visible — mismo mecanismo de datos que usaba el
  // calendario de día único (tabla boletin_publicaciones, columna fecha),
  // pero sin volver a traer un buffer global: solo el mes que se está
  // pintando. Se dispara de nuevo al cambiar de mes.
  useEffect(() => {
    let cancelado = false
    const desdeMes = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-01`
    const hastaMes = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`
    const supabase = createClient()
    supabase
      .from('boletin_publicaciones')
      .select('fecha')
      .gte('fecha', desdeMes)
      .lte('fecha', hastaMes)
      .limit(3000) // válvula de seguridad, no el mecanismo de filtrado
      .then(({ data }) => {
        if (cancelado) return
        setFechasConDatos(new Set((data ?? []).map(r => r.fecha)))
      })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth])

  const puedeAvanzar = viewYear < parseInt(today.slice(0,4), 10)
    || (viewYear === parseInt(today.slice(0,4), 10) && viewMonth < parseInt(today.slice(5,7), 10) - 1)

  const prev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const next = () => {
    if (!puedeAvanzar) return
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRadius: 8,
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column',
      padding: '12px 10px',
    }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={prev} style={navBtn}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
          {MESES[viewMonth]} {viewYear}
        </span>
        <button onClick={next} disabled={!puedeAvanzar} style={{ ...navBtn, opacity: puedeAvanzar ? 1 : 0.25, cursor: puedeAvanzar ? 'pointer' : 'not-allowed' }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, padding: '2px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />
          const disabled   = cell.iso > maxDate
          const esExtremo  = cell.iso === desde || cell.iso === hasta
          const enRango    = !!desde && !!hasta && cell.iso > desde && cell.iso < hasta
          const isToday    = cell.iso === today
          const tieneDatos = fechasConDatos.has(cell.iso)

          return (
            <div key={cell.iso}
              onClick={() => !disabled && onChange(cell.iso)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                padding: '5px 0 4px',
                fontSize: 11,
                borderRadius: esExtremo ? 5 : 0,
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: esExtremo ? 'var(--accent)' : enRango ? 'rgba(100,138,255,0.18)' : 'transparent',
                color: esExtremo ? '#fff' : disabled ? 'var(--text-faint)' : 'var(--text)',
                fontWeight: esExtremo ? 700 : 400,
                border: isToday && !esExtremo ? '1px solid rgba(100,138,255,0.5)' : '1px solid transparent',
                transition: 'background .12s',
              }}>
              <span>{cell.day}</span>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: tieneDatos ? (esExtremo ? '#fff' : 'var(--accent)') : 'transparent',
              }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--text-muted)', cursor: 'pointer',
  fontSize: 18, padding: '0 6px', lineHeight: 1,
}

// ── Selector de fecha (un solo calendario para "desde" y "hasta") ──────────────
// Selección en dos clics dentro del mismo popover: el primer clic fija
// "desde" (y arranca un rango de un solo día); el segundo clic fija "hasta"
// — salvo que el día clickeado sea anterior a "desde", en cuyo caso se
// interpreta como el inicio de una nueva selección (se reemplaza "desde").
// El tope superior de selección combina dos reglas independientes: nunca se
// puede elegir un día futuro (`today`), y mientras se espera el segundo clic
// tampoco se puede exceder el máximo de 3 meses (`maxHastaPara(desde)`). Por
// construcción no se puede clickear un extremo inválido, así que el rechazo
// silencioso que prohíbe la tarea no aplica aquí (no hay nada inválido que
// corregir en la interacción del picker).

function SelectorFecha({ desde, hasta, onRangoChange }: {
  desde: string
  hasta: string
  onRangoChange: (desde: string, hasta: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [paso, setPaso] = useState<'desde' | 'hasta'>('desde')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function alternar() {
    setPaso('desde') // cada apertura arranca una selección nueva
    setAbierto(a => !a)
  }

  function onDiaClick(iso: string) {
    if (paso === 'desde' || iso < desde) {
      onRangoChange(iso, iso) // primer clic (o reinicio): rango de un día
      setPaso('hasta')
      return
    }
    onRangoChange(desde, iso) // segundo clic: cierra el rango
    setPaso('desde')
    setAbierto(false)
  }

  const today = todayISO()
  const topeTresMeses = maxHastaPara(desde)
  const maxDateEfectivo = paso === 'hasta'
    ? (topeTresMeses < today ? topeTresMeses : today)
    : today

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={alternar} style={dateBtnStyle}>
        📅 {desde === hasta ? formatFecha(desde) : `${formatFecha(desde)} – ${formatFecha(hasta)}`}
      </button>
      {abierto && (
        <div style={popoverStyle}>
          <Calendario
            desde={desde}
            hasta={hasta}
            maxDate={maxDateEfectivo}
            onChange={onDiaClick}
          />
        </div>
      )}
    </div>
  )
}

const dateBtnStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 6, padding: '5px 10px', fontSize: 12,
  cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20,
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BoletinClient({ publicaciones, desde, hasta }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Selección pendiente del picker — se sincroniza con la URL (props) una vez
  // válida. No se corrige en silencio: si excede el máximo, se rechaza y se
  // avisa; la fecha previa se mantiene.
  const [desdeSel, setDesdeSel] = useState(desde)
  const [hastaSel, setHastaSel] = useState(hasta)
  const [advertencia, setAdvertencia] = useState('')

  // "Ajustar estado durante el render" en vez de un useEffect: si la URL
  // cambió por fuera del picker (p.ej. botón atrás/adelante del navegador),
  // React reconcilia esto antes de pintar, sin un pase de efecto extra.
  const [prevDesde, setPrevDesde] = useState(desde)
  const [prevHasta, setPrevHasta] = useState(hasta)
  if (desde !== prevDesde) { setPrevDesde(desde); setDesdeSel(desde) }
  if (hasta !== prevHasta) { setPrevHasta(hasta); setHastaSel(hasta) }

  useEffect(() => {
    if (desdeSel === desde && hastaSel === hasta) return
    if (excedeRangoMaximo(desdeSel, hastaSel)) return // defensa en profundidad, no debería pasar
    const params = new URLSearchParams({ desde: desdeSel, hasta: hastaSel })
    startTransition(() => {
      router.replace(`/boletin?${params.toString()}`, { scroll: false })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desdeSel, hastaSel])

  // Único punto de entrada del picker: los dos extremos se fijan juntos
  // (ver SelectorFecha), así que se validan juntos — defensa en profundidad,
  // el `maxDate` del Calendario ya impide clickear un "hasta" inválido.
  function handleRangoChange(d: string, h: string) {
    if (excedeRangoMaximo(d, h)) {
      setAdvertencia(`El rango máximo a consultar es de ${RANGO_MAX_MESES} meses.`)
      return
    }
    setDesdeSel(d)
    setHastaSel(h)
  }

  const [tab,          setTab]          = useState('todas')
  const [regionFiltro, setRegionFiltro] = useState('')
  const [busqueda,     setBusqueda]     = useState('')

  const categorias = useMemo(() => {
    const cats = new Set(publicaciones.map(p => p.categoria))
    return CATEGORIAS_ORDEN.filter(c => cats.has(c))
  }, [publicaciones])

  const regiones = useMemo(
    () => [...new Set(publicaciones.map(p => p.region).filter(Boolean))].sort() as string[],
    [publicaciones]
  )

  const filtradas = useMemo(() => {
    return publicaciones.filter(p => {
      if (tab !== 'todas' && p.categoria !== tab) return false
      if (regionFiltro && p.region !== regionFiltro) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        return (
          p.nombre.toLowerCase().includes(q) ||
          (p.titular ?? '').toLowerCase().includes(q) ||
          (p.causa_rol ?? '').toLowerCase().includes(q) ||
          (p.juzgado ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [publicaciones, tab, regionFiltro, busqueda])

  const irAlMapa = (p: BoletinPublicacion) =>
    router.push(`/mapa?nombre=${encodeURIComponent(p.nombre)}`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {advertencia && (
        <AlertDialog
          title="Rango de fechas inválido"
          message={advertencia}
          onClose={() => setAdvertencia('')}
        />
      )}

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <h1 style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15, margin: 0 }}>
            Boletín Oficial de Minería
          </h1>
          <span style={{
            fontSize: 11, color: 'var(--accent)',
            background: 'rgba(100,138,255,0.1)', border: '1px solid rgba(100,138,255,0.2)',
            borderRadius: 4, padding: '1px 7px',
            opacity: isPending ? 0.5 : 1,
          }}>
            {filtradas.length} publicaciones
          </span>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SelectorFecha
            desde={desdeSel}
            hasta={hastaSel}
            onRangoChange={handleRangoChange}
          />

          <select value={regionFiltro} onChange={e => setRegionFiltro(e.target.value)}
            style={{ ...selectStyle, maxWidth: 180 }}>
            <option value=''>Todas las regiones</option>
            {regiones.map(r => <option key={r} value={r}>{shortRegion(r)}</option>)}
          </select>

          <input type='text' placeholder='Buscar concesión, titular, ROL...'
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ ...selectStyle, flex: 1, minWidth: 180, maxWidth: 300 }} />
        </div>

        {/* Tabs categoría */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          {['todas', ...categorias].map(c => (
            <button key={c} onClick={() => setTab(c)} style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              border: '1px solid',
              borderColor: tab === c ? 'var(--accent)' : 'var(--border)',
              background: tab === c ? 'rgba(100,138,255,0.15)' : 'transparent',
              color: tab === c ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}>
              {c === 'todas' ? 'Todas' : catLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ flex: 1, overflow: 'auto', opacity: isPending ? 0.6 : 1, transition: 'opacity .15s' }}>
        {filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay publicaciones entre el {formatFecha(desde)} y el {formatFecha(hasta)}
            {(tab !== 'todas' || regionFiltro || busqueda) ? ' con los filtros aplicados.' : '.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{
                borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0,
                background: 'var(--bg)', zIndex: 1,
              }}>
                {['Concesión','Titular','Tipo','ROL Judicial','Juzgado','Región','Comuna',
                  'Norte','Este','Alto (m)','Ancho (m)','Área (há)','FS / N°','Conservador','PDF',''].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '7px 10px',
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: 10,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(p => (
                <tr key={p.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,138,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                  <td style={{ padding: '7px 10px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {p.nombre}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.titular ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontSize: 10, borderRadius: 4, padding: '2px 6px',
                      background: getCatBg(p.categoria), color: getCatColor(p.categoria),
                      fontWeight: 600,
                    }}>
                      {catLabel(p.categoria)}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--accent)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {p.causa_rol ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.juzgado ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {p.region ? shortRegion(p.region) : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {p.comuna ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {p.norte ? formatCoord(p.norte) : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {p.este ? formatCoord(p.este) : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.alto ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.ancho ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.area_ha ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {p.inscripcion_fs ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.conservador ?? '—'}
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    {p.url_pdf
                      ? <a href={p.url_pdf} target='_blank' rel='noopener noreferrer'
                          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 11 }}>PDF →</a>
                      : '—'}
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <button onClick={() => irAlMapa(p)} title='Buscar en el mapa'
                      style={{
                        background: 'rgba(100,138,255,0.12)',
                        border: '1px solid rgba(100,138,255,0.3)',
                        borderRadius: 5, padding: '3px 8px',
                        color: 'var(--accent)', fontSize: 11,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                      🗺 Mapa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 6, padding: '4px 8px', fontSize: 12,
}

function formatFecha(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function shortRegion(r: string) {
  return r.replace(/^REGI[OÓ]N\s+DE[L]?\s+/i, '').replace(/^REGI[OÓ]N\s+/i, '')
}

function formatCoord(s: string) {
  const n = parseFloat(s)
  if (isNaN(n)) return s
  return n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

function catLabel(c: string) {
  return c
    .replace('PEDIMENTOS MINEROS', 'Pedimento')
    .replace('MANIFESTACIONES MINERAS', 'Manifestación')
    .replace('SOLICITUDES DE MENSURA', 'Mensura')
    .replace('PRÓRROGAS DE CONCESIONES DE EXPLORACIÓN', 'Prórroga Explor.')
    .replace('PRÓRROGAS DE CONCESIONES DE EXPLOTACIÓN', 'Prórroga Explot.')
}

function getCatBg(cat: string) {
  if (cat.includes('PEDIMENTO'))   return 'rgba(100,138,255,0.12)'
  if (cat.includes('MANIFESTACI')) return 'rgba(76,175,80,0.12)'
  if (cat.includes('MENSURA'))     return 'rgba(255,193,7,0.12)'
  if (cat.includes('PRÓRROGA'))    return 'rgba(206,147,216,0.15)'
  return 'rgba(255,255,255,0.06)'
}

function getCatColor(cat: string) {
  if (cat.includes('PEDIMENTO'))   return '#648aff'
  if (cat.includes('MANIFESTACI')) return '#4CAF50'
  if (cat.includes('MENSURA'))     return '#FFC107'
  if (cat.includes('PRÓRROGA'))    return '#CE93D8'
  return 'var(--text-muted)'
}
