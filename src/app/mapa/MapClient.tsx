'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Profile, FavoritoRow } from '@/types/database'
import AppShell from '@/components/layout/AppShell'
import { addFavorito, removeFavorito } from './favorites'

// ─── Color mapping (matches SERNAGEOMIN viewer) ───────────────────────────────

function colorByTipo(props: Record<string, any>): string {
  const tipo   = props.TIPO_CONCESION || ''
  const sit    = props.SITUACION_CONCESION || ''
  const origen = props.ORIGEN || ''
  const sal    = props.ESTACAMENTO_SALITRERO

  if (sal === 'S')                                        return '#00E5FF'
  if (tipo === 'EXPLOTACION' && origen.includes('1932')) return '#FF1744'
  if (tipo === 'EXPLOTACION' && sit === 'EN TRAMITE')    return '#E040FB'
  if (tipo === 'EXPLOTACION' && sit === 'CONSTITUIDA')   return '#2979FF'
  if (tipo === 'EXPLORACION' && sit === 'EN TRAMITE')    return '#FFD600'
  if (tipo === 'EXPLORACION' && sit === 'CONSTITUIDA')   return '#00E676'
  return '#7C4DFF'
}

const LEGEND = [
  { color: '#00E5FF', label: 'Estac. Salitreros'              },
  { color: '#FF1744', label: 'Explotación Cód.1932'           },
  { color: '#E040FB', label: 'Explotación 1983 en trámite'    },
  { color: '#2979FF', label: 'Explotación 1983 Constituída'   },
  { color: '#FFD600', label: 'Pedimentos en trámite'          },
  { color: '#00E676', label: 'Exploración Constituída'        },
  { color: '#FFD600', label: 'Pedimento boletín (- - -)', dashed: true },
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

function sectionHTML(title: string, rows: string, id?: string) {
  return `<div ${id ? `id="${id}"` : ''} style="margin-bottom:20px">
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

export default function MapClient({
  profile,
  initialFavoritos,
  buscarNombre,
}: {
  profile: Profile | null
  initialFavoritos: FavoritoRow[]
  buscarNombre?: string
}) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const panelRef    = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Bridge Leaflet callbacks ↔ React state
  const mapActionsRef = useRef<{
    flyTo(lat: number, lng: number, zoom?: number): void
    openModal(props: Record<string, any>): void
    zoomIn(): void
    zoomOut(): void
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

  // Favorites — seeded from server, mutated via Server Actions
  const [favoritos,    setFavoritos]    = useState<FavoritoRow[]>(initialFavoritos)
  const [loadingFavId, setLoadingFavId] = useState<string | null>(null)

  useEffect(() => { favoritosRef.current = favoritos }, [favoritos])

  const toggleFavorito = useCallback(async (props: Record<string, any>) => {
    if (!profile) return
    const rol   = String(props.NUMERO_ROL)
    const isFav = favoritosRef.current.some(f => f.numero_rol === rol)

    if (isFav) {
      const existing = favoritosRef.current.find(f => f.numero_rol === rol)
      setFavoritos(prev => prev.filter(f => f.numero_rol !== rol))
      const { error } = await removeFavorito(rol)
      if (error) {
        // revert optimistic update on failure
        if (existing) setFavoritos(prev => [existing, ...prev])
      }
    } else {
      const { data, error } = await addFavorito({
        numero_rol: rol,
        dv_rol: props.DV_ROL ?? null,
        nombre: props.NOMBRE ?? null,
        tipo_concesion: props.TIPO_CONCESION ?? null,
        situacion_concesion: props.SITUACION_CONCESION ?? null,
        titular_nombre: props.TITULAR_NOMBRE ?? null,
        comuna: props.COMUNA ?? null,
      })
      if (error) {
        console.error('Error guardando favorito:', error)
        // revert optimistic button state
        const favBtn = document.getElementById('modal-fav-btn') as HTMLButtonElement | null
        if (favBtn) { favBtn.textContent = '☆'; favBtn.style.color = '#7a82a8' }
        return
      }
      if (data) setFavoritos(prev => [data, ...prev])
    }
  }, [profile])

  useEffect(() => { toggleFavRef.current = toggleFavorito }, [toggleFavorito])

  // Click en favorito: busca datos completos en SERNAGEOMIN y abre el panel
  const clickFavorito = useCallback(async (fav: FavoritoRow) => {
    if (!mapActionsRef.current) return
    setLoadingFavId(fav.id)
    try {
      const where = encodeURIComponent(`NUMERO_ROL = ${fav.numero_rol}`)
      const url = `https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query?where=${where}&outFields=*&returnGeometry=true&f=geojson&resultRecordCount=1`
      const res  = await fetch(url)
      const data = await res.json()
      if (data.features?.[0]) {
        const feature  = data.features[0]
        const centroid = getCentroid(feature.geometry)
        if (centroid) mapActionsRef.current.flyTo(centroid[0], centroid[1], 15)
        setTimeout(() => mapActionsRef.current?.openModal(feature.properties), centroid ? 900 : 0)
      } else {
        // Fallback: abrir con datos almacenados (sin coordenadas)
        mapActionsRef.current.openModal({
          NUMERO_ROL: fav.numero_rol, DV_ROL: fav.dv_rol,
          NOMBRE: fav.nombre, TIPO_CONCESION: fav.tipo_concesion,
          SITUACION_CONCESION: fav.situacion_concesion,
          TITULAR_NOMBRE: fav.titular_nombre, COMUNA: fav.comuna,
        })
      }
    } catch {
      mapActionsRef.current.openModal({
        NUMERO_ROL: fav.numero_rol, DV_ROL: fav.dv_rol,
        NOMBRE: fav.nombre, TIPO_CONCESION: fav.tipo_concesion,
        SITUACION_CONCESION: fav.situacion_concesion,
        TITULAR_NOMBRE: fav.titular_nombre, COMUNA: fav.comuna,
      })
    } finally {
      setLoadingFavId(null)
    }
  }, [])

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

      const map = L.map(mapRef.current!, { zoomControl: false }).setView([-33.45, -70.65], 11)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // Geolocalización del usuario al abrir el mapa
      if (navigator?.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => map.setView([pos.coords.latitude, pos.coords.longitude], 12),
          () => {},
          { timeout: 8000 },
        )
      }

      // CSS para etiquetas de concesiones
      const styleEl = document.createElement('style')
      styleEl.textContent = `
        .concesion-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          font-size: 9px;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 0 4px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1), 1px 1px 2px rgba(0,0,0,.8);
          white-space: nowrap;
          pointer-events: none;
          padding: 0 !important;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .concesion-label::before { display: none !important; }
        .hide-labels .concesion-label { display: none !important; }
      `
      document.head.appendChild(styleEl)
      mapRef.current!.classList.add('hide-labels')
      map.on('zoomend', () => {
        const z = map.getZoom()
        if (z >= 13) mapRef.current!.classList.remove('hide-labels')
        else mapRef.current!.classList.add('hide-labels')
      })

      function openModal(props: Record<string, any>) {
        const {
          NUMERO_ROL, DV_ROL, NOMBRE, HECTAREAS,
          SITUACION_CONCESION, TIPO_CONCESION,
          COMUNA, TITULAR_NOMBRE, TITULAR_RUT, TITULAR_DV, TITULAR_DIVISION,
          FECHA_VENCIMIENTO, NRO_INSCRIPCION, FOJAS, ANO_INSCRIPCION,
          ID_CONCESION, HUSO,
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

        const isBoletinOnly = props._source === 'boletin'

        document.getElementById('modal-title')!.textContent = NOMBRE || 'Concesión sin nombre'
        document.getElementById('modal-tipo')!.textContent  = TIPO_CONCESION || ''
        const fuenteEl = document.getElementById('modal-fuente')
        if (fuenteEl) fuenteEl.textContent = isBoletinOnly
          ? 'Fuente: Boletín Oficial de Minería'
          : 'Fuente: SERNAGEOMIN · FeatureServer WGS84'

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
            fieldRow('Comuna', COMUNA),
            'modal-sec-ident'
          )}
          ${sectionHTML('Titular',
            fieldRow('Nombre', TITULAR_NOMBRE) +
            fieldRow('RUT', rut) +
            fieldRow('División', TITULAR_DIVISION),
            'modal-sec-titular'
          )}
          ${sectionHTML('Inscripción CBR',
            fieldRow('N° inscripción', NRO_INSCRIPCION) +
            fieldRow('Fojas', FOJAS) +
            fieldRow('Año', ANO_INSCRIPCION),
            'modal-sec-inscripcion'
          )}
          <div id="modal-vertices" style="display:none;margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a82a8;margin-bottom:8px">Coordenadas UTM</div>
            <div id="modal-vertices-body"></div>
          </div>
          <div id="modal-boletin" style="background:rgba(100,138,255,.05);border:1px solid rgba(100,138,255,.15);border-radius:8px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#648aff;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">
              Boletín Oficial
            </div>
            <div style="font-size:11px;color:#404870;font-style:italic">Cargando…</div>
          </div>
          <div id="modal-pagos" style="background:rgba(0,230,118,.04);border:1px solid rgba(0,230,118,.15);border-radius:8px;padding:12px;margin-top:10px">
            <div style="font-size:10px;font-weight:700;color:#00E676;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">
              Pago de Patentes
            </div>
            <div style="font-size:11px;color:#404870;font-style:italic">Cargando…</div>
          </div>`

        // Async: load UTM vertices from SERNAGEOMIN Layer 0
        if (ID_CONCESION) {
          fetch(`/api/concesiones/vertices?id=${encodeURIComponent(ID_CONCESION)}`)
            .then(r => r.json())
            .then((verts: any[]) => {
              const container = document.getElementById('modal-vertices')
              const body = document.getElementById('modal-vertices-body')
              if (!container || !body || !verts.length) return
              const husoLabel = HUSO ? `Huso ${HUSO} Sur · PSAD56` : 'PSAD56'
              body.innerHTML =
                `<div style="font-size:10px;color:#7a82a8;margin-bottom:6px">${husoLabel}</div>` +
                verts.map(v =>
                  `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(46,50,71,.5)">
                    <span style="font-size:11px;font-weight:600;color:#7a82a8;width:24px">L${v.n}</span>
                    <span style="font-size:12px;color:#dde2f5">N ${Number(v.norte).toLocaleString('es-CL', {maximumFractionDigits:0})}</span>
                    <span style="font-size:12px;color:#dde2f5">E ${Number(v.este).toLocaleString('es-CL', {maximumFractionDigits:0})}</span>
                  </div>`
                ).join('')
              container.style.display = 'block'
            })
            .catch(() => {})
        }

        // Async: load boletín data for this concession
        if (NOMBRE) {
          fetch(`/api/boletin/concesion?nombre=${encodeURIComponent(NOMBRE)}`)
            .then(r => r.json())
            .then((pubs: any[]) => {
              const el = document.getElementById('modal-boletin')
              if (!el) return
              if (!pubs.length) {
                el.innerHTML = `<div style="font-size:10px;font-weight:700;color:#648aff;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Boletín Oficial</div>
                  <div style="font-size:11px;color:#404870;font-style:italic">Sin publicaciones en el boletín</div>`
                return
              }
              const latest = pubs[0]
              const boletinLink = latest.url_pdf
                ? `<a href="${latest.url_pdf}" target="_blank" rel="noopener" style="color:#648aff;font-size:11px;text-decoration:none">Ver PDF →</a>`
                : ''

              // Show all publications as a cronología timeline
              const catLabel = (cat: string) => {
                if (cat.includes('MANIFESTAC')) return 'Manifestación'
                if (cat.includes('MENSURA')) return 'Mensura'
                if (cat.includes('SENTENCIA')) return 'Sentencia'
                if (cat.includes('REMATE')) return 'Remate'
                if (cat.includes('INSCRIPCION') || cat.includes('INSCRIPCIÓN')) return 'Inscripción'
                const w = cat.split(' ').slice(0,2).join(' ')
                return w.charAt(0) + w.slice(1).toLowerCase()
              }
              const allRows = pubs.map(p =>
                `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(46,50,71,.4)">
                  <span style="font-size:11px;color:#c0c9f0;flex:1">${catLabel(p.categoria || '')}</span>
                  <span style="font-size:10px;color:#7a82a8;flex-shrink:0">${p.fecha}</span>
                  ${p.url_pdf ? `<a href="${p.url_pdf}" target="_blank" rel="noopener" style="color:#648aff;font-size:10px;text-decoration:none;margin-left:8px">PDF</a>` : ''}
                </div>`
              ).join('')

              el.innerHTML = `
                <div style="font-size:10px;font-weight:700;color:#648aff;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Boletín Oficial ${boletinLink}</div>
                ${latest.juzgado ? fieldRow('Juzgado', latest.juzgado) : ''}
                ${latest.causa_rol ? fieldRow('Causa ROL', latest.causa_rol) : ''}
                ${latest.conservador ? fieldRow('Conservador', latest.conservador) : ''}
                ${latest.inscripcion_fs ? fieldRow('FS / N°', latest.inscripcion_fs) : ''}
                ${latest.area_ha ? fieldRow('Área (há)', latest.area_ha) : ''}
                <div style="margin-top:8px">
                  <div style="font-size:10px;font-weight:600;color:#7a82a8;margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em">Publicaciones</div>
                  ${allRows}
                </div>`

              // Si SERNAGEOMIN no tiene datos (pedimento nuevo), rellenar secciones superiores
              if (!NUMERO_ROL) {
                // Deducir estado y tipo analizando TODAS las publicaciones disponibles.
                // Las categorías del BOM tienen una jerarquía legal:
                //   PEDIMENTO / MANIFESTACION → etapa inicial (exploración en trámite)
                //   MENSURA                   → etapa intermedia (aún en trámite)
                //   SENTENCIA                 → fallo judicial (puede constituir)
                //   INSCRIPCION               → inscrita en CBR (constituida)
                //   PERTENENCIA               → explotación (puede estar en trámite o constituida)
                const cats = pubs.map((p: any) => (p.categoria || '').toUpperCase())
                const hasInscripcion  = cats.some((c: string) => c.includes('INSCRIPCION') || c.includes('INSCRIPCIÓN'))
                const hasSentencia    = cats.some((c: string) => c.includes('SENTENCIA'))
                const hasMensura      = cats.some((c: string) => c.includes('MENSURA'))
                const hasPertenencia  = cats.some((c: string) => c.includes('PERTENENCIA'))
                const hasPedimento    = cats.some((c: string) => c.includes('PEDIMENTO') || c.includes('MANIFESTAC'))

                let sitInferida: string
                let tipoInferido: string

                if (hasInscripcion) {
                  sitInferida  = 'CONSTITUIDA'
                  tipoInferido = hasPertenencia ? 'Explotación' : 'Exploración'
                } else if (hasSentencia) {
                  sitInferida  = 'EN TRAMITE'   // sentencia publicada pero aún no inscrita
                  tipoInferido = hasPertenencia ? 'Explotación' : 'Exploración'
                } else if (hasMensura) {
                  sitInferida  = 'EN TRAMITE'
                  tipoInferido = 'Exploración'
                } else if (hasPertenencia) {
                  sitInferida  = 'EN TRAMITE'
                  tipoInferido = 'Explotación'
                } else {
                  sitInferida  = 'EN TRAMITE'
                  tipoInferido = hasPedimento ? 'Exploración' : 'Exploración'
                }

                const sitStylesMap: Record<string, { bg: string; color: string }> = {
                  'CONSTITUIDA': { bg: 'rgba(34,197,94,.12)',  color: '#22c55e' },
                  'EN TRAMITE':  { bg: 'rgba(234,179,8,.12)', color: '#eab308' },
                }
                const s = sitStylesMap[sitInferida] ?? { bg: 'rgba(234,179,8,.12)', color: '#eab308' }
                const badgeEl2 = document.getElementById('modal-badge')
                if (badgeEl2) {
                  badgeEl2.textContent      = sitInferida
                  badgeEl2.style.background = s.bg
                  badgeEl2.style.color      = s.color
                }
                const tipoEl = document.getElementById('modal-tipo')
                if (tipoEl && tipoInferido) tipoEl.textContent = tipoInferido
                // Identificación: superficie y región/provincia
                const secIdent = document.getElementById('modal-sec-ident')
                if (secIdent) {
                  const superficieVal = latest.area_ha ? `${Number(latest.area_ha).toLocaleString('es-CL')} há` : null
                  const lugarVal = latest.provincia
                    ? latest.provincia.replace(/^Provincia de /i, '')
                    : (latest.region ? latest.region.replace(/^REGIÓN DE /i, '') : null)
                  secIdent.innerHTML = `
                    <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a82a8;margin-bottom:8px">Identificación</div>
                    ${fieldRow('Rol / DV', null)}
                    ${fieldRow('Superficie', superficieVal)}
                    ${fieldRow('Vencimiento', null)}
                    ${fieldRow('Zona', lugarVal)}`
                }

                // Titular
                const secTitular = document.getElementById('modal-sec-titular')
                if (secTitular && latest.titular) {
                  secTitular.innerHTML = `
                    <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a82a8;margin-bottom:8px">Titular</div>
                    ${fieldRow('Nombre', latest.titular)}
                    ${fieldRow('RUT', null)}
                    ${fieldRow('División', null)}`
                }

                // Inscripción CBR — parsear inscripcion_fs "Fjs: 1392 N°: 770"
                const secInscr = document.getElementById('modal-sec-inscripcion')
                if (secInscr && (latest.inscripcion_fs || latest.inscripcion_date)) {
                  let nroInscr: string | null = null
                  let fojas: string | null = null
                  if (latest.inscripcion_fs) {
                    const nroMatch = latest.inscripcion_fs.match(/N[°º]?[:\s]*(\d+)/i)
                    const fjsMatch = latest.inscripcion_fs.match(/Fj[^:\d]*[:\s]*(\d+)/i)
                    nroInscr = nroMatch?.[1] ?? null
                    fojas    = fjsMatch?.[1] ?? null
                  }
                  secInscr.innerHTML = `
                    <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a82a8;margin-bottom:8px">Inscripción CBR</div>
                    ${fieldRow('N° inscripción', nroInscr)}
                    ${fieldRow('Fojas', fojas)}
                    ${fieldRow('Año', latest.inscripcion_date)}
                    ${latest.conservador ? fieldRow('Conservador', latest.conservador) : ''}`
                }
              }
            })
            .catch(() => {
              const el = document.getElementById('modal-boletin')
              if (el) el.innerHTML = `<div style="font-size:10px;font-weight:700;color:#648aff;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Boletín Oficial</div>
                <div style="font-size:11px;color:#404870;font-style:italic">No disponible</div>`
            })
        }

        // Async: load payment data (with Supabase cache)
        if (NUMERO_ROL) {
          const rolFmt  = String(NUMERO_ROL).padStart(9, '0')
          const tipoFmt = encodeURIComponent(TIPO_CONCESION || 'EXPLOTACION')
          fetch(`/api/concesiones/detalle?rol=${rolFmt}&tipo=${tipoFmt}`)
            .then(r => r.json())
            .then((det: any) => {
              const el = document.getElementById('modal-pagos')
              if (!el) return
              if (!det?.pagos?.length) {
                el.innerHTML = `<div style="font-size:10px;font-weight:700;color:#00E676;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Pago de Patentes</div>
                  <div style="font-size:11px;color:#404870;font-style:italic">Sin pagos registrados</div>`
                return
              }
              const rows = [...det.pagos]
                .sort((a: any, b: any) => parseInt(b.periodo) - parseInt(a.periodo))
                .map((p: any) => `<tr>
                  <td style="font-size:11px;color:#c0c9f0;padding:3px 6px">${p.periodo}</td>
                  <td style="font-size:11px;color:#c0c9f0;padding:3px 6px">${p.fecha}</td>
                  <td style="font-size:11px;color:#7a82a8;padding:3px 6px;text-align:right">${p.hectareas} hás</td>
                  <td style="font-size:11px;color:#00E676;padding:3px 6px;text-align:right;font-weight:600">${p.valor}</td>
                </tr>`).join('')
              el.innerHTML = `
                <div style="font-size:10px;font-weight:700;color:#00E676;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Pago de Patentes</div>
                <table style="width:100%;border-collapse:collapse">
                  <thead><tr>
                    <th style="font-size:10px;color:#7a82a8;padding:3px 6px;text-align:left;font-weight:500">Año</th>
                    <th style="font-size:10px;color:#7a82a8;padding:3px 6px;text-align:left;font-weight:500">Fecha</th>
                    <th style="font-size:10px;color:#7a82a8;padding:3px 6px;text-align:right;font-weight:500">Sup.</th>
                    <th style="font-size:10px;color:#7a82a8;padding:3px 6px;text-align:right;font-weight:500">Valor</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>`
            })
            .catch(() => {
              const el = document.getElementById('modal-pagos')
              if (el) el.style.display = 'none'
            })
        } else {
          const el = document.getElementById('modal-pagos')
          if (el) el.style.display = 'none'
        }

        backdrop.style.display = 'block'
        panel.style.transform  = 'translateX(0)'
      }

      mapActionsRef.current = {
        flyTo:    (lat, lng, zoom = 15) => map.flyTo([lat, lng], zoom),
        openModal,
        zoomIn:   () => map.zoomIn(),
        zoomOut:  () => map.zoomOut(),
      }

      // ── Auto-search from boletín link ─────────────────────────────────────────
      if (buscarNombre) {
        const where = encodeURIComponent(`UPPER(NOMBRE) LIKE UPPER('%${buscarNombre}%')`)
        const url = `https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query?where=${where}&outFields=*&returnGeometry=true&f=geojson&resultRecordCount=5`
        fetch(url)
          .then(r => r.json())
          .then(data => {
            const feat = data.features?.find((f: any) => f.properties?.SITUACION_CONCESION !== 'ELIMINADA') ?? data.features?.[0]
            if (feat) {
              const centroid = getCentroid(feat.geometry)
              if (centroid) map.flyTo([centroid[0], centroid[1]], 15)
              setTimeout(() => openModal(feat.properties), centroid ? 900 : 0)
            } else {
              // No en SERNAGEOMIN — buscar centroide en nuestra caché Supabase
              fetch(`/api/concesiones/centroid?nombre=${encodeURIComponent(buscarNombre)}`)
                .then(r => r.json())
                .then(cent => {
                  if (cent?.lat && cent?.lng) {
                    map.flyTo([cent.lat, cent.lng], 15)
                    setTimeout(() => openModal(cent), 900)
                  } else {
                    openModal({ NOMBRE: buscarNombre })
                  }
                })
                .catch(() => openModal({ NOMBRE: buscarNombre }))
            }
          })
          .catch(() => openModal({ NOMBRE: buscarNombre }))
      }

      // ── Concessions layer ───────────────────────────────────────────────────
      let concesionesLayer: L.GeoJSON | null = null
      let debounce: ReturnType<typeof setTimeout> | null = null
      let abortCtrl: AbortController | null = null
      const statusEl = document.getElementById('map-status')!

      function renderLayer(data: any) {
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
            const nombre = feature.properties?.NOMBRE
            if (nombre) {
              layer.bindTooltip(nombre, {
                permanent: true,
                direction: 'center',
                className: 'concesion-label',
              })
            }
            layer.on('click', () => openModal(feature.properties))
            layer.on('mouseover', function(this: L.Path) { this.setStyle({ weight: 3, fillOpacity: 0.45 }) })
            layer.on('mouseout',  function(this: L.Path) { if (concesionesLayer) concesionesLayer.resetStyle(this) })
          },
        }).addTo(map)
        const n = data.features.length
        statusEl.textContent = `${n} concesión${n !== 1 ? 'es' : ''}`
        statusEl.style.color = '#22c55e'
      }

      async function loadFromSernageomin(bbox: string, signal: AbortSignal) {
        const where = encodeURIComponent(`SITUACION_CONCESION <> 'ELIMINADA'`)
        const url   = `https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query?where=${where}&geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson&outSR=4326&resultRecordCount=2000`
        const res  = await fetch(url, { signal })
        return res.json()
      }

      async function loadConcesiones() {
        if (map.getZoom() < 10) {
          if (concesionesLayer) { map.removeLayer(concesionesLayer); concesionesLayer = null }
          statusEl.textContent = ''; statusEl.style.display = 'none'
          return
        }
        abortCtrl?.abort()
        abortCtrl = new AbortController()
        const signal = abortCtrl.signal

        statusEl.textContent = 'Cargando concesiones…'
        statusEl.style.display = 'block'
        statusEl.style.color = '#60a5fa'

        const b    = map.getBounds()
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`

        try {
          // Intentar primero desde nuestra caché en Supabase
          const res  = await fetch(`/api/concesiones?bbox=${bbox}`, { signal })
          const data = await res.json()

          if (data.source === 'supabase' || data.source === 'empty') {
            if (data.source === 'empty') {
              // Tabla vacía aún — fallback a SERNAGEOMIN
              statusEl.textContent = 'Consultando SERNAGEOMIN…'
              const fallback = await loadFromSernageomin(bbox, signal)
              renderLayer(fallback)
            } else {
              renderLayer(data)
            }
          } else {
            // Error en nuestra API — fallback a SERNAGEOMIN
            const fallback = await loadFromSernageomin(bbox, signal)
            renderLayer(fallback)
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            // Último recurso: intentar SERNAGEOMIN directo
            try {
              const fallback = await loadFromSernageomin(bbox, abortCtrl.signal)
              renderLayer(fallback)
            } catch {
              statusEl.textContent = 'Error cargando concesiones'
              statusEl.style.color = '#ef4444'
            }
          }
        }
      }

      // ── Boletín layer (pedimentos no en SERNAGEOMIN) ──────────────────────────
      fetch('/api/boletin/mapa')
        .then(r => r.json())
        .then((geojson: any) => {
          if (!geojson?.features?.length) return
          L.geoJSON(geojson, {
            style: () => ({
              color: '#FFD600', weight: 1.5, dashArray: '5,4',
              fillColor: '#FFD600', fillOpacity: 0.18, opacity: 0.85,
            }),
            onEachFeature(feature, layer) {
              const nombre = feature.properties?.NOMBRE
              if (nombre) {
                layer.bindTooltip(nombre, {
                  permanent: true, direction: 'center', className: 'concesion-label',
                })
              }
              layer.on('click', () => openModal(feature.properties))
              layer.on('mouseover', function(this: L.Path) { this.setStyle({ weight: 3, fillOpacity: 0.38 }) })
              layer.on('mouseout',  function(this: L.Path) { this.setStyle({ color: '#FFD600', weight: 1.5, dashArray: '5,4', fillColor: '#FFD600', fillOpacity: 0.18, opacity: 0.85 }) })
            },
          }).addTo(map)
        })
        .catch(() => {})

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

        {/* Custom zoom control — se mueve con el sidebar */}
        <div style={{
          position: 'absolute',
          left: (sidebarOpen ? SIDEBAR_W : 0) + 10,
          top: 10, zIndex: 900,
          transition: 'left .22s cubic-bezier(.4,0,.2,1)',
          display: 'flex', flexDirection: 'column',
          background: '#141928', border: '1px solid #2a3154',
          borderRadius: 6, overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,.4)',
        }}>
          {[{label: '+', fn: 'zoomIn'}, {label: '−', fn: 'zoomOut'}].map(({ label, fn }, i) => (
            <button key={fn}
              onClick={() => (mapActionsRef.current as any)?.[fn]?.()}
              style={{
                width: 30, height: 30, background: 'none', border: 'none',
                borderBottom: i === 0 ? '1px solid #2a3154' : 'none',
                color: '#dde2f5', cursor: 'pointer',
                fontSize: 18, lineHeight: 1, fontWeight: 300,
              }}
            >{label}</button>
          ))}
        </div>

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
                      borderRadius: 6, marginBottom: 4,
                      background: '#141928', border: '1px solid #2e3247',
                      display: 'flex', alignItems: 'flex-start',
                      opacity: loadingFavId === fav.id ? 0.5 : 1,
                      transition: 'opacity .15s',
                    }}>
                      {/* Área clickeable — abre el panel de detalle */}
                      <button
                        onClick={() => clickFavorito(fav)}
                        disabled={loadingFavId !== null}
                        style={{
                          flex: 1, minWidth: 0, background: 'none', border: 'none',
                          cursor: loadingFavId ? 'wait' : 'pointer', textAlign: 'left',
                          padding: '8px 6px 8px 10px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,138,255,.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#dde2f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {loadingFavId === fav.id ? '…' : (fav.nombre || 'Sin nombre')}
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
                      </button>
                      {/* Botón eliminar */}
                      <button
                        title="Quitar de favoritos"
                        onClick={async () => {
                          setFavoritos(prev => prev.filter(f => f.id !== fav.id))
                          await removeFavorito(fav.numero_rol)
                        }}
                        style={{ background: 'none', border: 'none', color: '#404870', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: '8px 8px', lineHeight: 1, alignSelf: 'center' }}
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
          {LEGEND.map(({ color, label, dashed }: any) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: 11, color: '#dde2f5' }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: dashed ? 'transparent' : color,
                border: dashed ? `2px dashed ${color}` : 'none',
              }} />
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
            <p id="modal-fuente" style={{ fontSize: 10, color: '#404870', margin: 0 }}>Fuente: SERNAGEOMIN · FeatureServer WGS84</p>
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
