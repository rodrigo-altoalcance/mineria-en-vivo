'use client'

import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BoletinPublicacion } from '@/types/database'
import AlertDialog from '@/components/ui/AlertDialog'
import { excedeRangoMaximo, minDesdePara, maxHastaPara, RANGO_MAX_MESES } from '@/lib/dateRange'

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

// ── Mini-calendario (usado dos veces: "desde" y "hasta") ───────────────────────
// `minDate`/`maxDate` deshabilitan visualmente las celdas fuera del rango
// válido según el otro extremo ya elegido. El popup de advertencia (aviso de
// refuerzo, no único mecanismo) lo dispara el handler en BoletinClient si de
// todas formas llega un onChange fuera de rango.

function Calendario({ selected, minDate, maxDate, onChange }: {
  selected: string
  minDate?: string
  maxDate?: string
  onChange: (d: string) => void
}) {
  const today = new Date().toISOString().split('T')[0]

  const init = selected ? new Date(selected + 'T12:00:00') : new Date()
  const [viewYear,  setViewYear]  = useState(init.getFullYear())
  const [viewMonth, setViewMonth] = useState(init.getMonth())

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

  const prev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const next = () => {
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
        <button onClick={next} style={navBtn}>›</button>
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
          const disabled = (!!minDate && cell.iso < minDate) || (!!maxDate && cell.iso > maxDate)
          const isSel    = cell.iso === selected
          const isToday  = cell.iso === today

          return (
            <div key={cell.iso}
              onClick={() => !disabled && onChange(cell.iso)}
              style={{
                textAlign: 'center',
                padding: '5px 0',
                fontSize: 11,
                borderRadius: 5,
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: isSel ? 'var(--accent)' : 'transparent',
                color: isSel ? '#fff' : disabled ? 'var(--text-faint)' : 'var(--text)',
                fontWeight: isSel ? 700 : 400,
                border: isToday && !isSel ? '1px solid rgba(100,138,255,0.5)' : '1px solid transparent',
                transition: 'background .12s',
              }}>
              {cell.day}
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

// ── Selector de rango (Desde / Hasta) ───────────────────────────────────────────

function SelectorRango({ desde, hasta, onDesdeChange, onHastaChange }: {
  desde: string
  hasta: string
  onDesdeChange: (d: string) => void
  onHastaChange: (d: string) => void
}) {
  const [abierto, setAbierto] = useState<'desde' | 'hasta' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ display: 'flex', gap: 6 }}>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setAbierto(a => a === 'desde' ? null : 'desde')} style={dateBtnStyle}>
          <span style={{ color: 'var(--text-muted)' }}>Desde</span> {formatFecha(desde)}
        </button>
        {abierto === 'desde' && (
          <div style={popoverStyle}>
            <Calendario
              selected={desde}
              maxDate={hasta || undefined}
              minDate={hasta ? minDesdePara(hasta) : undefined}
              onChange={d => { onDesdeChange(d); setAbierto(null) }}
            />
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button onClick={() => setAbierto(a => a === 'hasta' ? null : 'hasta')} style={dateBtnStyle}>
          <span style={{ color: 'var(--text-muted)' }}>Hasta</span> {formatFecha(hasta)}
        </button>
        {abierto === 'hasta' && (
          <div style={popoverStyle}>
            <Calendario
              selected={hasta}
              minDate={desde || undefined}
              maxDate={desde ? maxHastaPara(desde) : undefined}
              onChange={d => { onHastaChange(d); setAbierto(null) }}
            />
          </div>
        )}
      </div>
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

  function handleDesdeChange(d: string) {
    if (excedeRangoMaximo(d, hastaSel)) {
      setAdvertencia(`El rango máximo a consultar es de ${RANGO_MAX_MESES} meses. Ajusta la fecha "hasta" o elige una fecha "desde" más reciente.`)
      return
    }
    setDesdeSel(d)
  }

  function handleHastaChange(d: string) {
    if (excedeRangoMaximo(desdeSel, d)) {
      setAdvertencia(`El rango máximo a consultar es de ${RANGO_MAX_MESES} meses. Ajusta la fecha "desde" o elige una fecha "hasta" más cercana.`)
      return
    }
    setHastaSel(d)
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
          <SelectorRango
            desde={desdeSel}
            hasta={hastaSel}
            onDesdeChange={handleDesdeChange}
            onHastaChange={handleHastaChange}
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
