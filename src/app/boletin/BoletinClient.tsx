'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { BoletinPublicacion } from '@/types/database'

interface Props {
  publicaciones: BoletinPublicacion[]
  fechas: string[]
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

// ── Mini-calendar ─────────────────────────────────────────────────────────────

function Calendario({ fechas, selected, onChange }: {
  fechas: string[]
  selected: string
  onChange: (d: string) => void
}) {
  const fechasSet = useMemo(() => new Set(fechas), [fechas])
  const today     = new Date().toISOString().split('T')[0]

  const init = selected ? new Date(selected + 'T12:00:00') : new Date()
  const [viewYear,  setViewYear]  = useState(init.getFullYear())
  const [viewMonth, setViewMonth] = useState(init.getMonth())

  const firstDow = (() => {
    let d = new Date(viewYear, viewMonth, 1).getDay() - 1
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
      width: 210, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--surface)',
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
          const hasData   = fechasSet.has(cell.iso)
          const isSel     = cell.iso === selected
          const isToday   = cell.iso === today

          return (
            <div key={cell.iso}
              onClick={() => hasData && onChange(cell.iso)}
              style={{
                position: 'relative',
                textAlign: 'center',
                padding: '5px 0 7px',
                fontSize: 11,
                borderRadius: 5,
                cursor: hasData ? 'pointer' : 'default',
                background: isSel ? 'var(--accent)' : 'transparent',
                color: isSel ? '#fff' : hasData ? 'var(--text)' : 'rgba(var(--text-rgb,200,200,200),0.3)',
                fontWeight: hasData ? 600 : 400,
                border: isToday && !isSel ? '1px solid rgba(100,138,255,0.5)' : '1px solid transparent',
                transition: 'background .12s',
              }}>
              {cell.day}
              {hasData && (
                <div style={{
                  position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                  width: 3, height: 3, borderRadius: '50%',
                  background: isSel ? 'rgba(255,255,255,0.7)' : 'var(--accent)',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)' }}>
        <div>{fechas.length} ediciones disponibles</div>
        {selected && (
          <div style={{ marginTop: 4, color: 'var(--accent)', fontWeight: 600 }}>
            {formatFecha(selected)}
          </div>
        )}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--text-muted)', cursor: 'pointer',
  fontSize: 18, padding: '0 6px', lineHeight: 1,
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BoletinClient({ publicaciones, fechas }: Props) {
  const router = useRouter()

  // Default to today if there are publications; otherwise most recent date
  const today = new Date().toISOString().split('T')[0]
  const defaultFecha = fechas.includes(today) ? today : (fechas[0] ?? '')

  const [tab,          setTab]          = useState('todas')
  const [fechaFiltro,  setFechaFiltro]  = useState(defaultFecha)
  const [regionFiltro, setRegionFiltro] = useState('')
  const [busqueda,     setBusqueda]     = useState('')

  const porFecha = useMemo(
    () => publicaciones.filter(p => !fechaFiltro || p.fecha === fechaFiltro),
    [publicaciones, fechaFiltro]
  )

  const categorias = useMemo(() => {
    const cats = new Set(porFecha.map(p => p.categoria))
    return CATEGORIAS_ORDEN.filter(c => cats.has(c))
  }, [porFecha])

  const regiones = useMemo(
    () => [...new Set(porFecha.map(p => p.region).filter(Boolean))].sort() as string[],
    [porFecha]
  )

  const filtradas = useMemo(() => {
    return porFecha.filter(p => {
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
  }, [porFecha, tab, regionFiltro, busqueda])

  const irAlMapa = (p: BoletinPublicacion) =>
    router.push(`/mapa?nombre=${encodeURIComponent(p.nombre)}`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

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
          }}>
            {filtradas.length} publicaciones
          </span>
        </div>

        {/* Filtros (sin selector de fecha — usa el calendario) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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

      {/* Body: calendario + tabla */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Calendario */}
        <Calendario
          fechas={fechas}
          selected={fechaFiltro}
          onChange={f => { setFechaFiltro(f); setTab('todas'); setRegionFiltro('') }}
        />

        {/* Tabla */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              {fechaFiltro
                ? `No hay publicaciones el ${formatFecha(fechaFiltro)}.`
                : 'Selecciona una fecha en el calendario.'}
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
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 6, padding: '4px 8px', fontSize: 12,
}

function formatFecha(iso: string) {
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
