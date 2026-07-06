import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Member } from '../types'
import { useCrew } from '../store/context'
import { useNow } from '../lib/useNow'
import { liveLocation, useLiveLocation } from '../lib/liveLocation'
import { formatAgo, minutesSince } from '../lib/util'

const FALLBACK: [number, number] = [48.8566, 2.3522]

/** A fix newer than this reads as "live"; older ones are a stale last-seen dot. */
const FRESH_MIN = 3

function pinIcon(member: Member, stale: boolean): L.DivIcon {
  const cls = `map-pin ${member.sos ? 'sos' : ''} ${stale ? 'stale' : ''}`.trim()
  return L.divIcon({
    className: '',
    html: `<div class="${cls}" style="background:${member.color}"><span>${member.emoji}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32]
  })
}

/** Fit the map to all located members whenever the set of points changes. */
function FitToCrew({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 16)
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 16 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

export function MapScreen() {
  const { members, meId } = useCrew()
  const now = useNow(5000)
  const { sharing, error } = useLiveLocation()

  const located = members.filter((m) => m.location)
  const points = located.map((m) => [m.location!.lat, m.location!.lng] as [number, number])
  const center = points[0] ?? FALLBACK

  return (
    <>
      <div className="section-title">Where's everyone · {located.length} sharing</div>

      {error && (
        <div className="banner warn" style={{ marginBottom: 10 }}>
          <span>📍</span>
          <span>{error}</span>
        </div>
      )}

      <div className="map-wrap" data-no-swipe>
        <MapContainer center={center} zoom={14} scrollWheelZoom style={{ height: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution='&copy; OpenStreetMap &copy; CARTO'
          />
          <FitToCrew points={points} />
          {located.map((m) => {
            const stale = minutesSince(m.location!.at, now) >= FRESH_MIN
            return (
              <Marker key={m.id} position={[m.location!.lat, m.location!.lng]} icon={pinIcon(m, stale && !m.sos)}>
                <Popup>
                  <strong>{m.name}</strong>
                  {m.id === meId ? ' (you)' : ''}
                  <br />
                  {m.sos
                    ? '🆘 SOS active'
                    : `${stale ? 'last seen' : '🟢 live'} · ${formatAgo(m.location!.at, now)}`}
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        <div className="map-controls">
          <button className="btn primary" onClick={() => liveLocation.toggle()}>
            {sharing ? '🟢 Sharing live — stop' : '📍 Share my location'}
          </button>
        </div>
      </div>

      <div className="disclaimer">
        Location is shared only with your crew, and only while you choose to share. “Live” keeps
        updating in the background as long as the app is open — it stays on even if you switch tabs
        or reopen the app. Tap stop to go dark again.
      </div>
    </>
  )
}
