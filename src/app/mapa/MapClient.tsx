'use client'

import { useEffect, useRef } from 'react'
import type { Profile } from '@/types/database'
import AppShell from '@/components/layout/AppShell'

interface Props { profile: Profile | null }

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  VIGENTE:    { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  CADUCADA:   { bg: 'rgba(249,115,22,0.12)',  color: '#f97316' },
  ELIMINADA:  { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
  SUSPENDIDA: { bg: 'rgba(234,179,8,0.12)',   color: '#eab308' },
}

function badgeStyle(s: string) {
  for (const [key, style] of Object.entries(BADGE_STYLES)) {
    if (s?.toUpperCase().includes(key)) return style
  }
  return { bg: 'rgba(100,138,255,0.12)', color: '#648aff' }
}

function fieldRow(label: string, value: string | number | null | undefined) {
  const display = value != null && String(value).trim() !== ''
    ? `<span style="font-size:13px;color:#dde2f5;text-align:right">${value}</span>`
    : `<span style="font-size:12px;color:#404870;font-style:italic">Sin dato</span>`
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(46,50,71,0.5);gap:12px">
    <span style="font-size:11px;font-weight:600;color:#7a82a8;flex-shrink:0">${label}</span>
    ${display}
  </div>`
}

function pendingRow(label: string) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(217,119,6,0.2);gap:12px">
    <span style="font-size:11px;font-weight:600;color:#7a82a8;flex-shrink:0">${label}</span>
    <span style="font-size:11px;font-style:italic;color:#d97706">Pendiente</span>
  </div>`
}

function sectionHTML(title: string, rows: string) {
  return `<div style="margin-bottom:20px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a82a8;margin-bottom:8px">${title}</div>
    ${rows}
  </div>`
}

export default function MapClient({ profile }: Props) {
  const mapRef    = useRef<HTMLDivElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return
    if ((mapRef.current as any)._leaflet_id) return

    const panel    = panelRef.current!
    const backdrop = backdropRef.current!

    function closeModal() {
      panel.style.transform = 'translateX(100%)'
      backdrop.style.display = 'none'
    }

    backdrop.addEventListener('click', closeModal)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const map = L.map(mapRef.current!, { zoomControl: true }).setView([-33.45, -70.65], 11)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      const SITUACION_COLORS: Record<string, string> = {
        VIGENTE: '#22c55e', CADUCADA: '#f97316',
        ELIMINADA: '#6b7280', SUSPENDIDA: '#eab308',
      }

      function colorBySituacion(s: string) {
        for (const key of Object.keys(SITUACION_COLORS)) {
          if (s?.toUpperCase().includes(key)) return SITUACION_COLORS[key]
        }
        return '#3b82f6'
      }

      function openModal(props: Record<string, any>) {
        const {
          NUMERO_ROL, DV_ROL, NOMBRE, HECTAREAS,
          SITUACION_CONCESION, TIPO_CONCESION, COMUNA,
          TITULAR_NOMBRE, TITULAR_RUT, TITULAR_DV, TITULAR_DIVISION,
          FECHA_VENCIMIENTO, NRO_INSCRIPCION, FOJAS, ANO_INSCRIPCION,
        } = props

        const rol       = NUMERO_ROL ? `${NUMERO_ROL}${DV_ROL ? '-' + DV_ROL : ''}` : null
        const rut       = TITULAR_RUT ? `${TITULAR_RUT}${TITULAR_DV ? '-' + TITULAR_DV : ''}` : null
        const hectareas = HECTAREAS != null ? `${Number(HECTAREAS).toLocaleString('es-CL')} ha` : null
        const situacion = SITUACION_CONCESION || 'DESCONOCIDA'
        const { bg, color } = badgeStyle(situacion)

        const titleEl  = document.getElementById('modal-title')!
        const tipoEl   = document.getElementById('modal-tipo')!
        const badgeEl  = document.getElementById('modal-badge')!
        const bodyEl   = document.getElementById('modal-body')!

        titleEl.textContent = NOMBRE || 'Concesión sin nombre'
        tipoEl.textContent  = TIPO_CONCESION || ''
        badgeEl.textContent = situacion
        badgeEl.style.background = bg
        badgeEl.style.color = color

        bodyEl.innerHTML = `
          ${sectionHTML('Identificación',
            fieldRow('Rol / DV', rol) +
            fieldRow('Superficie', hectareas) +
            fieldRow('Vencimiento', FECHA_VENCIMIENTO) +
            fieldRow('Comuna', COMUNA)
          )}
          ${sectionHTML('Titular',
            fieldRow('Nombre', TITULAR_NOMBRE) +
            fieldRow('RUT', rut) +
            fieldRow('División', TITULAR_DIVISION)
          )}
          ${sectionHTML('Inscripción CBR',
            fieldRow('N° inscripción', NRO_INSCRIPCION) +
            fieldRow('Fojas', FOJAS) +
            fieldRow('Año', ANO_INSCRIPCION)
          )}
          <div style="background:rgba(217,119,6,0.05);border:1px solid rgba(217,119,6,0.2);border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">
              Proceso Registral
              <span style="background:rgba(217,119,6,0.1);color:#d97706;font-size:9px;padding:2px 6px;border-radius:20px;margin-left:6px">Boletín — próximamente</span>
            </div>
            ${pendingRow('Juzgado')}
            ${pendingRow('Causa ROL')}
            ${pendingRow('Conservador')}
            ${pendingRow('Cronología')}
          </div>`

        backdrop.style.display = 'block'
        panel.style.transform = 'translateX(0)'
      }

      let concesionesLayer: L.GeoJSON | null = null
      let debounce: ReturnType<typeof setTimeout> | null = null
      let abortCtrl: AbortController | null = null

      const statusEl = document.getElementById('map-status')!

      async function loadConcesiones() {
        if (map.getZoom() < 10) {
          if (concesionesLayer) { map.removeLayer(concesionesLayer); concesionesLayer = null }
          statusEl.textContent = ''; statusEl.style.display = 'none'
          return
        }

        abortCtrl?.abort()
        abortCtrl = new AbortController()

        statusEl.textContent = 'Consultando SERNAGEOMIN…'
        statusEl.style.display = 'block'
        statusEl.style.color = '#60a5fa'

        const b = map.getBounds()
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`
        const url = `https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query?where=1%3D1&geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson&outSR=4326&resultRecordCount=2000`

        try {
          const res = await fetch(url, { signal: abortCtrl.signal })
          const data = await res.json()
          if (concesionesLayer) { map.removeLayer(concesionesLayer); concesionesLayer = null }

          if (!data.features?.length) {
            statusEl.textContent = 'Sin concesiones en esta área'
            statusEl.style.color = '#7a82a8'
            return
          }

          concesionesLayer = L.geoJSON(data, {
            style: (f) => {
              const c = colorBySituacion(f?.properties?.SITUACION_CONCESION || '')
              return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.22, opacity: 0.9 }
            },
            onEachFeature(feature, layer) {
              layer.on('click', () => openModal(feature.properties))
              layer.on('mouseover', function(this: L.Path) { this.setStyle({ weight: 3, fillOpacity: 0.45 }) })
              layer.on('mouseout', function(this: L.Path) { if (concesionesLayer) concesionesLayer.resetStyle(this) })
            },
          }).addTo(map)

          const n = data.features.length
          statusEl.textContent = `${n} concesión${n !== 1 ? 'es' : ''} en esta área`
          statusEl.style.color = '#22c55e'
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            statusEl.textContent = 'Error al conectar con SERNAGEOMIN'
            statusEl.style.color = '#ef4444'
          }
        }
      }

      map.on('moveend zoomend', () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(loadConcesiones, 600)
      })

      loadConcesiones()
    }

    init()
  }, [])

  return (
    <AppShell profile={profile}>
      <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 48px)' }}>

        {/* Mapa */}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Status bar */}
        <div id="map-status" style={{
          display: 'none', position: 'absolute', bottom: 28, left: '50%',
          transform: 'translateX(-50%)', zIndex: 900,
          padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
          background: '#141928', border: '1px solid #2a3154',
          boxShadow: '0 4px 24px rgba(0,0,0,.55)', whiteSpace: 'nowrap',
        }} />

        {/* Leyenda */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 900,
          background: '#141928', border: '1px solid #2a3154',
          borderRadius: 8, padding: '10px 14px', minWidth: 130,
          boxShadow: '0 4px 24px rgba(0,0,0,.55)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#7a82a8', marginBottom: 8 }}>Situación</div>
          {[['#22c55e','Vigente'],['#f97316','Caducada'],['#eab308','Suspendida'],['#6b7280','Eliminada'],['#3b82f6','Otra']].map(([c,l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: 11, color: '#dde2f5' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
              {l}
            </div>
          ))}
        </div>

        {/* Backdrop */}
        <div ref={backdropRef} style={{
          display: 'none', position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(1px)',
        }} />

        {/* Panel de detalle */}
        <aside ref={panelRef} style={{
          position: 'fixed', right: 0, top: 48, bottom: 0, width: 380,
          maxWidth: '100%', background: '#232738',
          borderLeft: '1px solid #2e3247', boxShadow: '0 0 40px rgba(0,0,0,.6)',
          zIndex: 1001, display: 'flex', flexDirection: 'column',
          transform: 'translateX(100%)',
          transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
        }}>
          {/* Header */}
          <div style={{ flexShrink: 0, padding: '16px 16px 12px', borderBottom: '1px solid #2e3247' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <h2 id="modal-title" style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.2, wordBreak: 'break-word' }} />
              <button id="modal-close" onClick={() => {
                if (panelRef.current) panelRef.current.style.transform = 'translateX(100%)'
                if (backdropRef.current) backdropRef.current.style.display = 'none'
              }} style={{ flexShrink: 0, background: 'none', border: 'none', color: '#7a82a8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span id="modal-badge" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: '.08em', textTransform: 'uppercase' }} />
              <span id="modal-tipo" style={{ fontSize: 11, color: '#7a82a8' }} />
            </div>
            <p style={{ fontSize: 10, color: '#404870' }}>Fuente: SERNAGEOMIN · FeatureServer WGS84_Concesion</p>
          </div>

          {/* Body */}
          <div id="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '16px' }} />

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #2e3247', display: 'flex', gap: 10 }}>
            <button style={{ flex: 1, background: '#648aff', color: '#00164d', fontWeight: 700, padding: '8px 16px', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer' }}>
              VER EXPEDIENTE
            </button>
            <button style={{ background: 'none', border: '1px solid #2e3247', color: '#7a82a8', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>
              ↗
            </button>
          </div>
        </aside>
      </div>
    </AppShell>
  )
}
