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

export default function BoletinClient({ publicaciones, fechas }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState('todas')
  const [fechaFiltro, setFechaFiltro] = useState(fechas[0] ?? '')
  const [regionFiltro, setRegionFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  const porFecha = useMemo(
    () => publicaciones.filter(p => !fechaFiltro || p.fecha === fechaFiltro),
    [publicaciones, fechaFiltro]
  )

  const categorias = useMemo(() => {
    const cats = new Set(porFecha.map(p => p.categoria))
    return CATEGORIAS_ORDEN.filter(c => cats.has(c))
  }, [porFecha])

  const regiones = useMemo(() => {
    return [...new Set(porFecha.map(p => p.region).filter(Boolean))].sort() as string[]
  }, [porFecha])

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

  const formatFecha = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  const irAlMapa = (p: BoletinPublicacion) => {
    router.push(`/mapa?nombre=${encodeURIComponent(p.nombre)}`)
  }

  const catLabel = (c: string) =>
    c.replace('PEDIMENTOS MINEROS', 'Pedimento')
     .replace('MANIFESTACIONES MINERAS', 'Manifestación')
     .replace('SOLICITUDES DE MENSURA', 'Mensura')
     .replace('PRÓRROGAS DE CONCESIONES DE EXPLORACIÓN', 'Prórroga Explor.')
     .replace('PRÓRROGAS DE CONCESIONES DE EXPLOTACIÓN', 'Prórroga Explot.')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
            style={selectStyle}>
            {fechas.map(f => <option key={f} value={f}>{formatFecha(f)}</option>)}
          </select>

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
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay publicaciones para los filtros seleccionados.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{
                borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0,
                background: 'var(--bg)', zIndex: 1,
              }}>
                {['Concesión', 'Titular', 'Tipo', 'ROL Judicial', 'Juzgado', 'Región', 'Comuna', 'Norte', 'Este', 'Alto (m)', 'Ancho (m)', 'Área (há)', 'FS / N°', 'Conservador', 'Fecha', 'PDF', ''].map(h => (
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
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatFecha(p.fecha)}
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 6, padding: '4px 8px', fontSize: 12,
}

function shortRegion(r: string) {
  return r.replace(/^REGI[OÓ]N\s+DE[L]?\s+/i, '').replace(/^REGI[OÓ]N\s+/i, '')
}

function formatCoord(s: string) {
  const n = parseFloat(s)
  if (isNaN(n)) return s
  return n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

function getCatBg(cat: string) {
  if (cat.includes('PEDIMENTO'))      return 'rgba(100,138,255,0.12)'
  if (cat.includes('MANIFESTACI'))    return 'rgba(76,175,80,0.12)'
  if (cat.includes('MENSURA'))        return 'rgba(255,193,7,0.12)'
  if (cat.includes('PRÓRROGA'))       return 'rgba(206,147,216,0.15)'
  return 'rgba(255,255,255,0.06)'
}

function getCatColor(cat: string) {
  if (cat.includes('PEDIMENTO'))      return '#648aff'
  if (cat.includes('MANIFESTACI'))    return '#4CAF50'
  if (cat.includes('MENSURA'))        return '#FFC107'
  if (cat.includes('PRÓRROGA'))       return '#CE93D8'
  return 'var(--text-muted)'
}
