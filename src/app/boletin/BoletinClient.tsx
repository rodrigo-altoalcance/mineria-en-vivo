'use client'

import { useState, useMemo } from 'react'
import type { BoletinPublicacion } from '@/types/database'

const CATEGORIAS_ORDEN = [
  'Manifestación Minera',
  'Solicitud de Mensura',
  'Prórroga Exploración',
  'Prórroga Explotación',
  'Pedimento Minero',
  'Otra',
]

interface Props {
  publicaciones: BoletinPublicacion[]
  fechas: string[]
}

export default function BoletinClient({ publicaciones, fechas }: Props) {
  const [tab, setTab] = useState<string>('todas')
  const [fechaFiltro, setFechaFiltro] = useState<string>(fechas[0] ?? '')
  const [regionFiltro, setRegionFiltro] = useState<string>('')
  const [busqueda, setBusqueda] = useState<string>('')

  const porFecha = useMemo(
    () => publicaciones.filter(p => !fechaFiltro || p.fecha === fechaFiltro),
    [publicaciones, fechaFiltro]
  )

  const categorias = useMemo(() => {
    const cats = [...new Set(porFecha.map(p => p.categoria))]
    return CATEGORIAS_ORDEN.filter(c => cats.includes(c))
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
          (p.titular ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [porFecha, tab, regionFiltro, busqueda])

  const formatFecha = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header + controls */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16, margin: 0 }}>
            Boletín Oficial de Minería
          </h1>
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            background: 'rgba(100,138,255,0.1)', border: '1px solid rgba(100,138,255,0.25)',
            borderRadius: 4, padding: '2px 8px',
          }}>
            {filtradas.length} publicaciones
          </span>
        </div>

        {/* Filters row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Date picker */}
          <select
            value={fechaFiltro}
            onChange={e => setFechaFiltro(e.target.value)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', borderRadius: 6, padding: '5px 8px', fontSize: 12,
            }}
          >
            {fechas.map(f => (
              <option key={f} value={f}>{formatFecha(f)}</option>
            ))}
          </select>

          {/* Region picker */}
          <select
            value={regionFiltro}
            onChange={e => setRegionFiltro(e.target.value)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', borderRadius: 6, padding: '5px 8px', fontSize: 12,
              maxWidth: 200,
            }}
          >
            <option value=''>Todas las regiones</option>
            {regiones.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {/* Search */}
          <input
            type='text'
            placeholder='Buscar nombre o titular...'
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', borderRadius: 6, padding: '5px 10px', fontSize: 12,
              flex: 1, minWidth: 160, maxWidth: 300,
            }}
          />
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
          {['todas', ...categorias].map(c => (
            <button
              key={c}
              onClick={() => setTab(c)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                border: '1px solid',
                borderColor: tab === c ? 'var(--accent)' : 'var(--border)',
                background: tab === c ? 'rgba(100,138,255,0.15)' : 'transparent',
                color: tab === c ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {c === 'todas' ? 'Todas' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay publicaciones para los filtros seleccionados.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)' }}>
                {['Nombre', 'Titular', 'Categoría', 'Región', 'Provincia', 'Fecha', 'PDF'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '8px 12px',
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(p => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,138,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '8px 12px', color: 'var(--text)', fontWeight: 500 }}>
                    {p.nombre}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                    {p.titular ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      fontSize: 10, borderRadius: 4, padding: '2px 6px',
                      background: getCatBg(p.categoria), color: getCatColor(p.categoria),
                      fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {p.categoria}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {p.region ? shortRegion(p.region) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                    {p.provincia ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatFecha(p.fecha)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {p.url_pdf ? (
                      <a
                        href={p.url_pdf}
                        target='_blank'
                        rel='noopener noreferrer'
                        style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 11 }}
                      >
                        PDF →
                      </a>
                    ) : '—'}
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

function getCatBg(cat: string): string {
  if (cat.includes('Manifestación')) return 'rgba(76,175,80,0.12)'
  if (cat.includes('Mensura')) return 'rgba(255,193,7,0.12)'
  if (cat.includes('Prórroga')) return 'rgba(206,147,216,0.15)'
  if (cat.includes('Pedimento')) return 'rgba(100,138,255,0.12)'
  return 'rgba(255,255,255,0.06)'
}

function getCatColor(cat: string): string {
  if (cat.includes('Manifestación')) return '#4CAF50'
  if (cat.includes('Mensura')) return '#FFC107'
  if (cat.includes('Prórroga')) return '#CE93D8'
  if (cat.includes('Pedimento')) return '#648aff'
  return 'var(--text-muted)'
}

function shortRegion(r: string): string {
  return r
    .replace(/^REGIÓN\s+DE\s+/i, '')
    .replace(/^REGIÓN\s+DEL\s+/i, '')
    .replace(/^REGIÓN\s+/i, '')
}
