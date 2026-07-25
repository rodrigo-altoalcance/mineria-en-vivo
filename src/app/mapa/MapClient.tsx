'use client'

import { useEffect, useRef } from 'react'
import type { Profile } from '@/types/database'
import AppShell from '@/components/layout/AppShell'

interface Props { profile: Profile | null }

export default function MapClient({ profile }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Leaflet carga dinámicamente (requiere window)
    if (!mapRef.current || typeof window === 'undefined') return
    if ((mapRef.current as any)._leaflet_id) return // ya inicializado

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

      let concesionesLayer: L.GeoJSON | null = null
      let debounce: ReturnType<typeof setTimeout> | null = null
      let abortCtrl: AbortController | null = null

      async function loadConcesiones() {
        if (map.getZoom() < 10) { concesionesLayer && map.removeLayer(concesionesLayer); return }

        abortCtrl?.abort()
        abortCtrl = new AbortController()

        const b = map.getBounds()
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`
        const url = `https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2/query?where=1%3D1&geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson&outSR=4326&resultRecordCount=2000`

        try {
          const res = await fetch(url, { signal: abortCtrl.signal })
          const data = await res.json()
          concesionesLayer && map.removeLayer(concesionesLayer)
          concesionesLayer = L.geoJSON(data, {
            style: (f) => {
              const c = colorBySituacion(f?.properties?.SITUACION_CONCESION || '')
              return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.22, opacity: 0.9 }
            },
          }).addTo(map)
        } catch {}
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
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 48px)' }} />
    </AppShell>
  )
}
