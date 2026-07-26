'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Profile, FavoritoRow } from '@/types/database'
import AppShell from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/client'

// ─── Color mapping (matches SERNAGEOMIN viewer) ───────────────────────────────

function colorByTipo(props: Record<string, any>): string {
  const tipo   = props.TIPO_CONCESION || ''
  const sit    = props.SITUACION_CONCESION || ''
  const origen = props.ORIGEN || ''
  const sal    = props.ESTACAMENTO_SALITRERO

  if (sal === 'S')                                        return '#00BCD4'
  if (tipo === 'EXPLOTACION' && origen.includes('1932')) return '#E53935'
  if (tipo === 'EXPLOTACION' && sit === 'EN TRAMITE')    return '#CE93D8'
  if (tipo === 'EXPLOTACION' && sit === 'CONSTITUIDA')   return '#1565C0'
  if (tipo === 'EXPLORACION' && sit === 'EN TRAMITE')    return '#C6E900'
  if (tipo === 'EXPLORACION' && sit === 'CONSTITUIDA')   return '#4CAF50'
  return '#648aff'
}

const LEGEND = [
  { color: '#00BCD4', label: 'Estac. Salitreros'           },
  { color: '#E53935', label: 'Explotación Cód.1932'        },
  { color: '#CE93D8', label: 'Explotación 1983 en trámite' },
  { color: '#1565C0', label: 'Explotación 1983 Constituída'},
  { color: '#C6E900', label: 'Pedimentos en trámite'       },
  { color: '#4CAF50', label: 'Exploración Constituída'     },
]

// ─── Modal HTML helpers ───────────────────────────────────────────────────────

function fieldRow(label: string, value: string | number | null | undefined) {
  const display = value != null && String(value).trim() !== ''
    ? `<span style="font-size:13px;color:#dde2f5;text-align:right">${value}</span>`
    : `<span style="font-size:12px;color:#404870;font-style:italic">Sin dato</span>`
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(46,50,71,.5);gap:12px">
    <span style="font-size:11px;font-weight:600;color:#7a82a8;flex-shrink:0">${label}</span>${display}</div>`
}

function pendingRow(label: string) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(217,119,6,.2);gap:12px">
    <span style="font-size:11px;font-weight:600;color:#7a82a8;flex-shrink:0">${label}</span>
    <span style="font-size:11px;font-style:italic;color:#d97706">Pendiente</span></div>`
}

function sectionHTML(title: string, rows: string) {
  return `<div style="margin-bottom:20px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a82a8;margin-bottom:8px">${title}</div>
    ${rows}</div>`
}

// ─── Geometry centroid ────────────────────────────────────────────────────────

function getCentroid(geometry: any): [number, number] | null {
  try {
    let ring: number[][] = []
    if (geometry?.type === 'Polygon')           ring = geometry.coordinates[0]
    else if (geometry?.type === 'MultiPolygon') ring = geometry.coordinates[0][0]
    else return null
    const n = ring.length
    return [
      ring.reduce((s, c) => s + c[1], 0) / n,
      ring.reduce((s, c) => s + c[0], 0) / n,
    ]
  } catch { return null }
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

function tipoLabel(tipo: string) {
  if (tipo === 'EXPLORACION') return 'Exploración'
  if (tipo === 'EXPLOTACION') return 'Explotación'
  return tipo
}

function sitColor(sit: string) {
  if (sit === 'CONSTITUIDA') return '#22c55e'
  if (sit === 'EN TRAMITE')  return '#eab308'
  return '#7a82a8'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeoPlace { place_id: number; display_name: string; lat: string; lon: string }

interface ConcResult {
  nombre: string; rol: string; tipo: string; situacion: string
  titular: string; centroid: [number, number]; props: Record<string, any>
}

const SIDEBAR_W = 268

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapClient({ profile }: { profile: Profile | null }) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const panelRef    = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Bridge Leaflet callbacks ↔ React state
  const mapActionsRef = useRef<{
    flyTo(lat: number, lng: number, zoom?: number): void
    openModal(props: Record<string, any>): void
  } | null>(null)
  const toggleFavRef  = useRef<((props: Record<string, any>) => void) | null>(null)
  const favoritosRef  = useRef<FavoritoRow[]>([])

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab]     = useState<'lugares' | 'concesiones' | 'favoritos'>('lugares')

  // Geocoder
  const [geoQuery,   setGeoQuery]   = useState('')
  const [geoResults, setGeoResults] = useState<GeoPlace[]>([])
  const [geoLoading, setGeoLoading] = useState(false)

  // Concession search
  const [concQuery,   setConcQuery]   = useState('')
  const [concResults, setConcResults] = useState<ConcResult[]>([])
  const [concLoading, setConcLoading] = useState(false)

  // Favorites
  const [favoritos, setFavoritos] = useState<FavoritoRow[]>([])

  const supabase = profile ? createClient() : null

  useEffect(() => { favoritosRef.current = favoritos }, [favoritos])

  // Load favorites on mount
  useEffect(() => {
    if (!supabase) return
    supabase.from('favoritos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setFavoritos(data as FavoritoRow[]) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle favorite (also called from inside Leaflet via ref)
  const toggleFavorito = useCallback(async (props: Record<string, any>) => {
    if (!supabase || !profile) return
    const rol   = String(props.NUMERO_ROL)
    const isFav = favoritosRef.current.some(f => f.numero_rol === rol)
    if (isFav) {
      await supabase.from('favoritos').delete().eq('user_id', profile.id).eq('numero_rol', rol)
      setFavoritos(prev => prev.filter(f => f.numero_rol !== rol))
    } else {
      const { data } = await supabase.from('favoritos').insert({
        user_id: profile.id, numero_rol: rol,
        dv_rol: props.DV_ROL ?? null, nombre: props.NOMBRE ?? null,
        tipo_concesion: props.TIPO_CONCESION ?? null,
        situacion_concesion: props.SITUACION_CONCESION ?? null,
        titular_nombre: props.TITULAR_NOMBRE ?? null,
        comuna: props.COMUNA ?? null,
      }).select().single()
      if (data) setFavoritos(prev => [data as FavoritoRow, ...prev])
    }
  }, [profile, supabase])

  useEffect(() => { toggleFavRef.current = toggleFavorito }, [toggleFavorito])

  // Geocoder with debounce
  useEffect(() => {
    if (!geoQuery.trim()) { setGeoResults([]); return }
    const t = setTimeout(async () => {
      setGeoLoading(true)
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geoQuery + ', Chile')}&format=json&countrycodes=cl&limit=6&accept-language=es`)
        const data = await res.json()
        setGeoResults(Array.isArray(data) ? data : [])
      } catch { setGeoResults([]) }
      setGeoLoading(false)
    }, 500)
    return () => clearTimeout(t)
  }, [geoQuery])

  // Concession search with debounce
  useEffect(() => {
    if (concQuery.length < 3) { setConcResults([]); return }
    const t = setTimeout(async () => {
      setConcLoading(true)
      try {
        const where = encodeURIComponent(`UPPER(NOMBRE) LIKE UPPER('%${concQuery}%') OR UPPER(TITULAR_NOMBRE) LIKE UPPER('%${concQuery}%')`)
        const url = `https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query?where=${where}&outFields=*&returnGeometry=true&f=geojson&resultRecordCount=20`
        const res  = await fetch(url)
        const data = await res.json()
        const results: ConcResult[] = []
        for (const f of (data.features ?? [])) {
          const p = f.properties
          if (p.SITUACION_CONCESION === 'ELIMINADA') continue
          const centroid = getCentroid(f.geometry)
          if (!centroid) continue
          results.push({
            nombre:    p.NOMBRE || 'Sin nombre',
            rol:       `${p.NUMERO_ROL}${p.DV_ROL ? '-' + p.DV_ROL : ''}`,
            tipo:      p.TIPO_CONCESION || '',
            situacion: p.SITUACION_CONCESION || '',
            titular:   p.TITULAR_NOMBRE || '',
            centroid,  props: p,
          })
        }
        setConcResults(results)
      } catch { setConcResults([]) }
      setConcLoading(false)
    }, 600)
    return () => clearTimeout(t)
  }, [concQuery])

  // ── Leaflet init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return
    if ((mapRef.current as any)._leaflet_id) return

    const panel    = panelRef.current!
    const backdrop = backdropRef.current!

    function closeModal() {
      panel.style.transform  = 'translateX(100%)'
      backdrop.style.display = 'none'
    }
    backdrop.addEventListener('click', closeModal)
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal() })

    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const map = L.map(mapRef.current!, { zoomControl: true }).setView([-33.45, -70.65], 11)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      function openModal(props: Record<string, any>) {
        const {
          NUMERO_ROL, DV_ROL, NOMBRE, HECTAREAS,
          SITUACION_CONCESION, TIPO_CONCESION,
          COMUNA, TITULAR_NOMBRE, TITULAR_RUT, TITULAR_DV, TITULAR_DIVISION,
          FECHA_VENCIMIENTO, NRO_INSCRIPCION, FOJAS, ANO_INSCRIPCION,
        } = props

        const rol       = NUMERO_ROL ? `${NUMERO_ROL}${DV_ROL ? '-' + DV_ROL : ''}` : null
        const rut       = TITULAR_RUT ? `${TITULAR_RUT}${TITULAR_DV ? '-' + TITULAR_DV : ''}` : null
        const hectareas = HECTAREAS != null ? `${Number(HECTAREAS).toLocaleString('es-CL')} ha` : null
        const sit       = SITUACION_CONCESION || 'DESCONOCIDA'

        const sitColors: Record<string, { bg: string; color: string }> = {
          'CONSTITUIDA': { bg: 'rgba(34,197,94,.12)',   color: '#22c55e' },
          'EN TRAMITE':  { bg: 'rgba(234,179,8,.12)',   color: '#eab308' },
          'ELIMINADA':   { bg: 'rgba(107,114,128,.12)', color: '#6b7280' },
        }
        const sitStyle = sitColors[sit] ?? { bg: 'rgba(100,138,255,.12)', color: '#648aff' }

        const isFav = favoritosRef.current.some(f => f.numero_rol === String(NUMERO_ROL))

        document.getElementById('modal-title')!.textContent = NOMBRE || 'Concesión sin nombre'
        document.getElementById('modal-tipo')!.textContent  = TIPO_CONCESION || ''

        const badgeEl = document.getElementById('modal-badge')!
        badgeEl.textContent      = sit
        badgeEl.style.background = sitStyle.bg
        badgeEl.style.color      = sitStyle.color

        const favBtn = document.getElementById('modal-fav-btn') as HTMLButtonElement
        favBtn.textContent  = isFav ? '★' : '☆'
        favBtn.style.color  = isFav ? '#f59e0b' : '#7a82a8'
        favBtn.onclick = () => {
          const wasFav = favoritosRef.current.some(f => f.numero_rol === String(NUMERO_ROL))
          toggleFavRef.current?.(props)
          favBtn.textContent = wasFav ? '☆' : '★'
          favBtn.style.color = wasFav ? '#7a82a8' : '#f59e0b'
        }

        document.getElementById('modal-body')!.innerHTML = `
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
          <div style="background:rgba(217,119,6,.05);border:1px solid rgba(217,119,6,.2);border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">
              Proceso Registral
              <span style="background:rgba(217,119,6,.1);color:#d97706;font-size:9px;padding:2px 6px;border-radius:20px;margin-left:6px">Boletín — próximamente</span>
            </div>
            ${pendingRow('Juzgado')}
            ${pendingRow('Causa ROL')}
            ${pendingRow('Conservador')}
            ${pendingRow('Cronología')}
          </div>`

        backdrop.style.display = 'block'
        panel.style.transform  = 'translateX(0)'
      }

      mapActionsRef.current = {
        flyTo:      (lat, lng, zoom = 15) => map.flyTo([lat, lng], zoom),
        openModal,
      }

      // ── Concessions layer ───────────────────────────────────────────────────
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

        const b    = map.getBounds()
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`
        const where = encodeURIComponent(`SITUACION_CONCESION <> 'ELIMINADA'`)
        const url = `https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query?where=${where}&geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson&outSR=4326&resultRecordCount=2000`

        try {
          const res  = await fetch(url, { signal: abortCtrl.signal })
          const data = await res.json()
          if (concesionesLayer) { map.removeLayer(concesionesLayer); concesionesLayer = null }

          if (!data.features?.length) {
            statusEl.textContent = 'Sin concesiones en esta área'
            statusEl.style.color = '#7a82a8'
            return
          }

          concesionesLayer = L.geoJSON(data, {
            style: f => {
              const c = colorByTipo(f?.properties ?? {})
              return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.22, opacity: 0.9 }
            },
            onEachFeature(feature, layer) {
              layer.on('click', () => openModal(feature.properties))
              layer.on('mouseover', function(this: L.Path) { this.setStyle({ weight: 3, fillOpacity: 0.45 }) })
              layer.on('mouseout',  function(this: L.Path) { if (concesionesLayer) concesionesLayer.resetStyle(this) })
            },
          }).addTo(map)

          const n = data.features.length
          statusEl.textContent = `${n} concesión${n !== 1 ? 'es' : ''}`
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppShell profile={profile}>
      <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>

        {/* Map (full canvas, sidebar overlays) */}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* ── Left Sidebar ── */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: sidebarOpen ? SIDEBAR_W : 0,
          transition: 'width .22s cubic-bezier(.4,0,.2,1)',
          zIndex: 950, overflow: 'hidden',
        }}>
          <div style={{
            width: SIDEBAR_W, height: '100%',
            background: '#0b0f1c', borderRight: '1px solid #2e3247',
            display: 'flex', flexDirection: 'column',
            boxShadow: '4px 0 24px rgba(0,0,0,.5)',
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #2e3247', flexShrink: 0 }}>
              {(['lugares', 'concesiones', 'favoritos'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: '10px 3px', fontSize: 9.5, fontWeight: 700,
                  letterSpacing: '.04em', textTransform: 'uppercase',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: activeTab === tab ? '#648aff' : '#7a82a8',
                  borderBottom: activeTab === tab ? '2px solid #648aff' : '2px solid transparent',
                }}>
                  {tab === 'lugares' ? '📍 Lugares' : tab === 'concesiones' ? '🔍 Buscar' : `⭐ Favoritos${favoritos.length ? ` (${favoritos.length})` : ''}`}
                </button>
              ))}
            </div>

            {/* ── Tab: Lugares ── */}
            {activeTab === 'lugares' && (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 12px', flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Buscar comuna o región…"
                      value={geoQuery}
                      onChange={e => setGeoQuery(e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: '#141928', border: '1px solid #2e3247',
                        borderRadius: 6, padding: '8px 10px 8px 30px',
                        fontSize: 12, color: '#dde2f5', outline: 'none',
                      }}
                    />
                    <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, pointerEvents: 'none' }}>🔍</span>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
                  {geoLoading && (
                    <div style={{ padding: 12, fontSize: 11, color: '#7a82a8', textAlign: 'center' }}>Buscando…</div>
                  )}
                  {!geoLoading && geoQuery && geoResults.length === 0 && (
                    <div style={{ padding: 12, fontSize: 11, color: '#404870', textAlign: 'center' }}>Sin resultados</div>
                  )}
                  {geoResults.map(place => {
                    const parts = place.display_name.split(',')
                    return (
                      <button key={place.place_id}
                        onClick={() => mapActionsRef.current?.flyTo(+place.lat, +place.lon, 12)}
                        style={{ width: '100%', display: 'block', textAlign: 'left', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '8px 10px', marginBottom: 2 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#141928')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <div style={{ fontSize: 11, color: '#dde2f5', lineHeight: 1.4 }}>{parts.slice(0, 2).join(',').trim()}</div>
                        {parts[2] && <div style={{ fontSize: 10, color: '#7a82a8', marginTop: 2 }}>{parts.slice(2, 4).join(',').trim()}</div>}
                      </button>
                    )
                  })}
                  {!geoQuery && (
                    <div style={{ padding: '24px 12px', fontSize: 11, color: '#404870', textAlign: 'center', lineHeight: 1.8 }}>
                      Busca una comuna,<br/>ciudad o región de Chile
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Concesiones ── */}
            {activeTab === 'concesiones' && (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 12px', flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Nombre, ROL o titular…"
                      value={concQuery}
                      onChange={e => setConcQuery(e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: '#141928', border: '1px solid #2e3247',
                        borderRadius: 6, padding: '8px 10px 8px 30px',
                        fontSize: 12, color: '#dde2f5', outline: 'none',
                      }}
                    />
                    <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, pointerEvents: 'none' }}>🔍</span>
                  </div>
                  {concQuery.length > 0 && concQuery.length < 3 && (
                    <div style={{ fontSize: 10, color: '#404870', marginTop: 4, paddingLeft: 2 }}>Escribe al menos 3 caracteres</div>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
                  {concLoading && (
                    <div style={{ padding: 12, fontSize: 11, color: '#7a82a8', textAlign: 'center' }}>Buscando a nivel nacional…</div>
                  )}
                  {!concLoading && concQuery.length >= 3 && concResults.length === 0 && (
                    <div style={{ padding: 12, fontSize: 11, color: '#404870', textAlign: 'center' }}>Sin resultados</div>
                  )}
                  {concResults.map((r, i) => (
                    <button key={i}
                      onClick={() => {
                        mapActionsRef.current?.flyTo(r.centroid[0], r.centroid[1], 15)
                        setTimeout(() => mapActionsRef.current?.openModal(r.props), 900)
                      }}
                      style={{ width: '100%', display: 'block', textAlign: 'left', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '8px 10px', marginBottom: 2 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#141928')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#dde2f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: '#7a82a8' }}>{r.rol}</span>
                        <span style={{ fontSize: 9, color: sitColor(r.situacion) }}>●</span>
                        <span style={{ fontSize: 9, color: '#7a82a8' }}>{tipoLabel(r.tipo)}</span>
                      </div>
                      {r.titular && (
                        <div style={{ fontSize: 10, color: '#404870', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.titular}</div>
                      )}
                    </button>
                  ))}
                  {concQuery.length < 3 && (
                    <div style={{ padding: '24px 12px', fontSize: 11, color: '#404870', textAlign: 'center', lineHeight: 1.8 }}>
                      Busca por nombre,<br/>ROL o titular<br/>(búsqueda nacional)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Favoritos ── */}
            {activeTab === 'favoritos' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {!profile ? (
                  <div style={{ padding: '24px 12px', fontSize: 11, color: '#404870', textAlign: 'center', lineHeight: 1.8 }}>
                    Inicia sesión para<br/>guardar favoritos
                  </div>
                ) : favoritos.length === 0 ? (
                  <div style={{ padding: '24px 12px', fontSize: 11, color: '#404870', textAlign: 'center', lineHeight: 1.8 }}>
                    Aún no tienes favoritos.<br/>Haz clic en ☆ en el panel<br/>de una concesión para guardarla.
                  </div>
                ) : (
                  favoritos.map(fav => (
                    <div key={fav.id} style={{
                      borderRadius: 6, padding: '8px 10px', marginBottom: 4,
                      background: '#141928', border: '1px solid #2e3247',
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#dde2f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {fav.nombre || 'Sin nombre'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: '#7a82a8' }}>
                            {fav.numero_rol}{fav.dv_rol ? '-' + fav.dv_rol : ''}
                          </span>
                          {fav.situacion_concesion && (
                            <span style={{ fontSize: 9, color: sitColor(fav.situacion_concesion) }}>●</span>
                          )}
                          {fav.tipo_concesion && (
                            <span style={{ fontSize: 9, color: '#404870' }}>{tipoLabel(fav.tipo_concesion)}</span>
                          )}
                        </div>
                        {fav.titular_nombre && (
                          <div style={{ fontSize: 10, color: '#404870', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {fav.titular_nombre}
                          </div>
                        )}
                      </div>
                      <button
                        title="Quitar de favoritos"
                        onClick={async () => {
                          if (!supabase) return
                          await supabase.from('favoritos').delete().eq('id', fav.id)
                          setFavoritos(prev => prev.filter(f => f.id !== fav.id))
                        }}
                        style={{ background: 'none', border: 'none', color: '#404870', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: '2px 4px', lineHeight: 1 }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#404870')}
                      >✕</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar toggle tab */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? 'Cerrar panel' : 'Abrir panel'}
          style={{
            position: 'absolute',
            left: sidebarOpen ? SIDEBAR_W - 1 : 0,
            top: '50%', transform: 'translateY(-50%)',
            transition: 'left .22s cubic-bezier(.4,0,.2,1)',
            zIndex: 951,
            background: '#0b0f1c', border: '1px solid #2e3247',
            borderLeft: 'none',
            borderRadius: '0 6px 6px 0',
            color: '#648aff', cursor: 'pointer',
            padding: '12px 5px', fontSize: 13, lineHeight: 1,
            boxShadow: '2px 0 10px rgba(0,0,0,.4)',
          }}
        >
          {sidebarOpen ? '‹' : '›'}
        </button>

        {/* Status bar */}
        <div id="map-status" style={{
          display: 'none', position: 'absolute', bottom: 28, left: '50%',
          transform: 'translateX(-50%)', zIndex: 900,
          padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
          background: '#141928', border: '1px solid #2a3154',
          boxShadow: '0 4px 24px rgba(0,0,0,.55)', whiteSpace: 'nowrap',
        }} />

        {/* Legend */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 900,
          background: '#141928', border: '1px solid #2a3154',
          borderRadius: 8, padding: '10px 14px', minWidth: 175,
          boxShadow: '0 4px 24px rgba(0,0,0,.55)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#7a82a8', marginBottom: 8 }}>Tipo de concesión</div>
          {LEGEND.map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: 11, color: '#dde2f5' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              {label}
            </div>
          ))}
        </div>

        {/* Backdrop */}
        <div ref={backdropRef} style={{
          display: 'none', position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(1px)',
        }} />

        {/* Detail panel (right) */}
        <aside ref={panelRef} style={{
          position: 'fixed', right: 0, top: 48, bottom: 0,
          width: 380, maxWidth: '100%',
          background: '#232738', borderLeft: '1px solid #2e3247',
          boxShadow: '0 0 40px rgba(0,0,0,.6)',
          zIndex: 1001, display: 'flex', flexDirection: 'column',
          transform: 'translateX(100%)',
          transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
        }}>
          <div style={{ flexShrink: 0, padding: '16px 16px 12px', borderBottom: '1px solid #2e3247' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <h2 id="modal-title" style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2, wordBreak: 'break-word', margin: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <button id="modal-fav-btn" title="Guardar en favoritos" style={{
                  background: 'none', border: 'none', color: '#7a82a8',
                  cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 5px',
                }}>☆</button>
                <button onClick={() => {
                  if (panelRef.current)    panelRef.current.style.transform  = 'translateX(100%)'
                  if (backdropRef.current) backdropRef.current.style.display = 'none'
                }} style={{
                  background: 'none', border: 'none', color: '#7a82a8',
                  cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 4px',
                }}>✕</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span id="modal-badge" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: '.08em', textTransform: 'uppercase' }} />
              <span id="modal-tipo" style={{ fontSize: 11, color: '#7a82a8' }} />
            </div>
            <p style={{ fontSize: 10, color: '#404870', margin: 0 }}>Fuente: SERNAGEOMIN · FeatureServer WGS84</p>
          </div>

          <div id="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 16 }} />

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
