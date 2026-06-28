import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Star, Phone, ExternalLink, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

export interface Place {
  name: string
  lat: number
  lng: number
  address?: string
  phone?: string
  website?: string
  rating?: number
  reviewCount?: number
  snippet?: string
  photoUrl?: string
  placeId?: string
  type?: string
}

interface Props {
  title?: string
  places: Place[]
  center?: { lat: number; lng: number }
  zoom?: number
}

const markerIcon = L.divIcon({
  className: 'place-map-marker',
  html: '<div class="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shadow-md ring-2 ring-background">•</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

function FocusController({ focus }: { focus: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!focus) return
    // MAP-5 fix: don't force-zoom up — that loses context of the other
    // markers. Instead: if the target is already visible, just pan; only
    // zoom in when it's off-screen, and cap the zoom at 13 (overview
    // level) rather than 14+ (street level).
    const target = L.latLng(focus.lat, focus.lng)
    const bounds = map.getBounds()
    const isVisible = bounds.contains(target)
    if (focus.zoom !== undefined) {
      map.flyTo(target, focus.zoom, { duration: 0.6 })
    } else if (isVisible) {
      map.panTo(target, { duration: 0.4 })
    } else {
      // Off-screen: soft zoom to 13 (overview) rather than 14 (street).
      map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 0.6 })
    }
  }, [focus, map])
  return null
}

function FitBounds({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 14)
      return
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export function PlaceMap({ title, places, center, zoom }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  const isDark = useIsDark()

  const valid = useMemo(
    () => places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [places]
  )

  const defaultCenter = useMemo(() => {
    if (center) return center
    if (valid.length === 0) return { lat: -32.9283, lng: 151.7817 } // Newcastle fallback
    const lat = valid.reduce((s, p) => s + p.lat, 0) / valid.length
    const lng = valid.reduce((s, p) => s + p.lng, 0) / valid.length
    return { lat, lng }
  }, [center, valid])

  const focus =
    selectedIdx !== null && valid[selectedIdx]
      ? { lat: valid[selectedIdx]!.lat, lng: valid[selectedIdx]!.lng }
      : null

  if (valid.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        <MapPin className="inline w-4 h-4 mr-1" />
        No places to show on the map.
      </Card>
    )
  }

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const tileAttribution = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  return (
    <div className="my-3 rounded-lg border bg-card overflow-hidden w-full max-w-full @container">
      {title && <div className="px-4 py-3 border-b font-semibold text-sm">{title}</div>}
      <div className="flex flex-col @[640px]:flex-row">
        <div className="relative h-[280px] @[640px]:h-[420px] @[640px]:flex-1 min-w-0">
          <MapContainer
            center={[defaultCenter.lat, defaultCenter.lng]}
            zoom={zoom ?? 12}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer attribution={tileAttribution} url={tileUrl} />
            <FitBounds points={valid} />
            <FocusController focus={focus} />
            {valid.map((p, i) => (
              <Marker
                key={`${p.placeId ?? p.name}-${i}`}
                position={[p.lat, p.lng]}
                icon={markerIcon}
                eventHandlers={{
                  click: () => {
                    setSelectedIdx(i)
                    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                  <strong>{p.name}</strong>
                  {p.rating ? <span> • {p.rating.toFixed(1)}★</span> : null}
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="border-t @[640px]:border-t-0 @[640px]:border-l @[640px]:w-[260px] @[640px]:shrink-0 @[640px]:h-[420px] @[640px]:overflow-y-auto divide-y">
          {valid.map((p, i) => {
            const selected = selectedIdx === i
            return (
              <div
                key={`${p.placeId ?? p.name}-card-${i}`}
                ref={(el) => {
                  cardRefs.current[i] = el
                }}
                className={`p-3 cursor-pointer transition-colors ${selected ? 'bg-accent' : 'hover:bg-accent/50'}`}
                onClick={() => setSelectedIdx(i)}
              >
                <div className="flex gap-3">
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt=""
                      className="w-14 h-14 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 min-w-0">
                      {p.rating !== undefined && (
                        <span className="flex items-center gap-0.5 whitespace-nowrap shrink-0">
                          <Star className="w-3 h-3 fill-current" />
                          {p.rating.toFixed(1)}
                          {p.reviewCount !== undefined && <span>&nbsp;({p.reviewCount})</span>}
                        </span>
                      )}
                      {p.type && <span className="truncate min-w-0">· {p.type}</span>}
                    </div>
                    {p.snippet && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {p.snippet}
                      </div>
                    )}
                    {(p.phone || p.website || p.address) && (
                      <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
                        {p.phone && (
                          <a
                            href={`tel:${p.phone.replace(/\s+/g, '')}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="w-3 h-3" />
                            {p.phone}
                          </a>
                        )}
                        {p.website && /^https?:\/\//i.test(p.website) && (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                            Website
                          </a>
                        )}
                      </div>
                    )}
                    {p.address && !p.snippet && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">{p.address}</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
