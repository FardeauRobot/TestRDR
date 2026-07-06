import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { MapPin, Member } from '../types'
import { useCrew, useMe, useStore } from '../store/context'
import { useNow } from '../lib/useNow'
import { liveLocation, useLiveLocation } from '../lib/liveLocation'
import { cx, formatAgo, minutesSince } from '../lib/util'

const FALLBACK: [number, number] = [48.8566, 2.3522]

/** A fix newer than this reads as "live"; older ones are a stale last-seen dot. */
const FRESH_MIN = 3

const PIN_EMOJI = ['📍', '⛺', '🚗', '🅿️', '🚻', '🔥', '🎪', '🍻', '⚠️', '🏥']

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

function markerIcon(pin: MapPin): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin custom"><span>${pin.emoji}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28]
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

/** Captures the next map tap while `active`, e.g. while dropping a pin. */
function PlaceCapture({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (active) onPick(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

export function MapScreen() {
  const { members, pins, meId } = useCrew()
  const me = useMe()
  const store = useStore()
  const now = useNow(5000)
  const { sharing, error } = useLiveLocation()

  const [placing, setPlacing] = useState(false)
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null)
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState(PIN_EMOJI[0])
  const [busy, setBusy] = useState(false)

  const located = members.filter((m) => m.location)
  const points = located.map((m) => [m.location!.lat, m.location!.lng] as [number, number])
  const center = points[0] ?? FALLBACK

  function startDraft(lat: number, lng: number) {
    setPlacing(false)
    setDraft({ lat, lng })
    setLabel('')
    setEmoji(PIN_EMOJI[0])
  }

  async function savePin() {
    if (!draft || !label.trim()) return
    setBusy(true)
    try {
      await store.addPin({ label: label.trim(), emoji, lat: draft.lat, lng: draft.lng })
      setDraft(null)
    } finally {
      setBusy(false)
    }
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

      {placing && (
        <div className="banner info" style={{ marginBottom: 10 }}>
          <span>📌</span>
          <span>Tap the map where you want the pin.</span>
        </div>
      )}

      <div className="map-wrap" data-no-swipe>
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom
          style={{ height: '100%', cursor: placing ? 'crosshair' : undefined }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution='&copy; OpenStreetMap &copy; CARTO'
          />
          <FitToCrew points={points} />
          <PlaceCapture active={placing} onPick={startDraft} />
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
          {pins.map((p) => {
            const author = members.find((mem) => mem.id === p.createdBy)
            const canRemove = p.createdBy === meId || me?.isAdmin
            return (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon(p)}>
                <Popup>
                  <strong>{p.emoji} {p.label}</strong>
                  <br />
                  dropped by {author?.name ?? 'a former crewmate'}
                  {canRemove && (
                    <>
                      <br />
                      <button className="btn" style={{ marginTop: 6 }} onClick={() => void store.removePin(p.id)}>
                        Remove pin
                      </button>
                    </>
                  )}
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        <div className="map-controls">
          <button className="btn" onClick={() => setPlacing((v) => !v)}>
            {placing ? '✕ Cancel' : '📌 Drop pin'}
          </button>
          <button className="btn primary" onClick={() => liveLocation.toggle()}>
            {sharing ? '🟢 Sharing live — stop' : '📍 Share my location'}
          </button>
        </div>
      </div>

      {draft && createPortal(
        <div className="check-backdrop" role="dialog" aria-modal="true" onClick={() => setDraft(null)}>
          <div
            className="check-card"
            style={{ textAlign: 'left', alignItems: 'stretch' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>Name this pin</div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Icon</label>
              <div className="chip-row">
                {PIN_EMOJI.map((em) => (
                  <button key={em} className={cx('chip', em === emoji && 'selected')} onClick={() => setEmoji(em)}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Label</label>
              <input
                className="input"
                value={label}
                placeholder="e.g. Camp, Parking, Water point"
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy || !label.trim()} onClick={() => void savePin()}>
                {busy ? 'Saving…' : 'Drop pin'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="disclaimer">
        Location is shared only with your crew, and only while you choose to share. “Live” keeps
        updating in the background as long as the app is open — it stays on even if you switch tabs
        or reopen the app. Tap stop to go dark again.
      </div>
    </>
  )
}
