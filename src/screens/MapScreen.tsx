import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Member } from '../types'
import { useCrew, useMe, useStore } from '../store/context'
import { useNow } from '../lib/useNow'
import { formatAgo } from '../lib/util'

const FALLBACK: [number, number] = [48.8566, 2.3522]

function pinIcon(member: Member): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin ${member.sos ? 'sos' : ''}" style="background:${member.color}"><span>${member.emoji}</span></div>`,
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
  const store = useStore()
  const now = useNow(5000)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)

  const me = useMe()
  const located = members.filter((m) => m.location)
  const points = located.map((m) => [m.location!.lat, m.location!.lng] as [number, number])
  const center = points[0] ?? FALLBACK

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  function shareOnce() {
    setError(null)
    if (!('geolocation' in navigator)) {
      setError('This device has no location support.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void store.updateLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now()
        })
      },
      (err) => setError(geoError(err)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  function toggleLive() {
    if (sharing) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
      setSharing(false)
      void store.updateLocation(null)
      return
    }
    setError(null)
    if (!('geolocation' in navigator)) {
      setError('This device has no location support.')
      return
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setSharing(true)
        void store.updateLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now()
        })
      },
      (err) => {
        setError(geoError(err))
        setSharing(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    )
  }

  return (
    <>
      <div className="section-title">Where's everyone · {located.length} sharing</div>

      {error && (
        <div className="banner warn" style={{ marginBottom: 10 }}>
          <span>📍</span>
          <span>{error}</span>
        </div>
      )}

      <div className="map-wrap">
        <MapContainer center={center} zoom={14} scrollWheelZoom style={{ height: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution='&copy; OpenStreetMap &copy; CARTO'
          />
          <FitToCrew points={points} />
          {located.map((m) => (
            <Marker key={m.id} position={[m.location!.lat, m.location!.lng]} icon={pinIcon(m)}>
              <Popup>
                <strong>{m.name}</strong>
                {m.id === meId ? ' (you)' : ''}
                <br />
                {m.sos ? '🆘 SOS active' : `located ${formatAgo(m.location!.at, now)}`}
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <div className="map-controls">
          <button className="btn primary" onClick={toggleLive}>
            {sharing ? '🟢 Sharing live — stop' : '📍 Share my location'}
          </button>
          {me && (me.sos ? (
            <button className="btn danger" style={{ flex: '0 0 auto', width: 'auto' }} onClick={() => void store.setSos(false)}>
              Clear SOS
            </button>
          ) : (
            <button
              className="btn"
              style={{ flex: '0 0 auto', width: 'auto', color: 'var(--sos)' }}
              onClick={() => {
                void store.setSos(true)
                shareOnce()
              }}
            >
              🆘
            </button>
          ))}
        </div>
      </div>

      <div className="disclaimer">
        Location is shared only with your crew, and only while you choose to share. “Live” keeps
        updating while this screen is open. Tap stop to go dark again.
      </div>
    </>
  )
}

function geoError(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED)
    return 'Location permission denied. Enable it for this site in your browser settings. (Note: live location needs an https:// link, not a local IP.)'
  if (err.code === err.POSITION_UNAVAILABLE) return 'Position unavailable right now — try again outside or near a window.'
  return 'Could not get a location fix — try again.'
}
