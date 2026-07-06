import { useSyncExternalStore } from 'react'
import type { CrewStore } from '../store/store'

/** Persisted "I want to broadcast my location" flag. Survives reloads so live
 *  sharing resumes on a cold start instead of silently going dark. */
const SHARE_KEY = 'crewwatch.share.v1'

interface LiveSnapshot {
  /** True once we have (or are actively getting) live fixes. */
  sharing: boolean
  /** Last geolocation error, if any. */
  error: string | null
}

/** App-level owner of the geolocation watch.
 *
 *  The watch used to live in local `MapScreen` state, so it stopped on reload and
 *  was scoped to one screen. Lifting it here means sharing keeps running no matter
 *  the tab, survives a reload (auto-resumes from `SHARE_KEY`), and any screen can
 *  read/toggle it via `useLiveLocation()`. Mirrors the store's subscribe/snapshot
 *  shape so it plugs into `useSyncExternalStore`. */
class LiveLocation {
  private snap: LiveSnapshot = { sharing: false, error: null }
  private listeners = new Set<() => void>()
  private watchId: number | null = null
  private store: CrewStore | null = null

  getSnapshot = (): LiveSnapshot => this.snap
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  private emit(next: Partial<LiveSnapshot>): void {
    this.snap = { ...this.snap, ...next }
    this.listeners.forEach((l) => l())
  }

  /** Wire in the store and resume sharing if the user left it on. Call once the
   *  crew is entered; call `detach()` when leaving so we stop broadcasting. */
  attach(store: CrewStore): void {
    this.store = store
    if (this.watchId == null && localStorage.getItem(SHARE_KEY) === '1') this.begin()
  }

  /** Stop the watch but keep the persisted intent (used when leaving a crew). */
  detach(): void {
    this.clearWatch()
    this.store = null
    this.emit({ sharing: false })
  }

  toggle(): void {
    if (this.snap.sharing || this.watchId != null) this.stop()
    else this.begin()
  }

  private begin(): void {
    this.emit({ error: null })
    if (!('geolocation' in navigator)) {
      this.emit({ error: 'This device has no location support.' })
      return
    }
    localStorage.setItem(SHARE_KEY, '1')
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.emit({ sharing: true, error: null })
        void this.store?.updateLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now()
        })
      },
      (err) => {
        // A denied permission won't recover by retrying — stop and clear the
        // intent so we don't relaunch straight into the same error on reload.
        if (err.code === err.PERMISSION_DENIED) this.stop()
        this.emit({ error: geoError(err) })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    )
  }

  /** Stop sharing and go dark (clears our pin for the crew). */
  stop(): void {
    this.clearWatch()
    localStorage.removeItem(SHARE_KEY)
    this.emit({ sharing: false })
    void this.store?.updateLocation(null)
  }

  private clearWatch(): void {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
  }
}

export const liveLocation = new LiveLocation()

/** Reactive view of the live-sharing state. */
export function useLiveLocation(): LiveSnapshot {
  return useSyncExternalStore(liveLocation.subscribe, liveLocation.getSnapshot)
}

function geoError(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED)
    return 'Location permission denied. Enable it for this site in your browser settings. (Note: live location needs an https:// link, not a local IP.)'
  if (err.code === err.POSITION_UNAVAILABLE) return 'Position unavailable right now — try again outside or near a window.'
  return 'Could not get a location fix — try again.'
}
