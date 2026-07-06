import { useRef, useState } from 'react'
import { useMe, useStore } from '../store/context'

/** Hold-to-activate SOS, persistent on every screen.
 *
 *  Why hold (not tap): a single tap is too easy to fire from a pocket; a ~0.8s
 *  press with a visible fill confirms intent without needing a dialog (dialogs
 *  are exactly what you can't deal with while impaired or panicking). Once
 *  active it flips to a plain tap-to-clear so cancelling is instant. Activating
 *  also grabs a one-off location fix so the crew can find you on the map. */
const HOLD_MS = 800

export function SosFab() {
  const me = useMe()
  const store = useStore()
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  if (!me) return null

  function clear() {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = undefined
  }

  function start() {
    if (me?.sos) return
    setHolding(true)
    clear()
    timer.current = window.setTimeout(fire, HOLD_MS)
  }

  function cancel() {
    setHolding(false)
    clear()
  }

  function fire() {
    setHolding(false)
    clear()
    navigator.vibrate?.(200)
    void store.setSos(true)
    shareLocationOnce()
  }

  function shareLocationOnce() {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        void store.updateLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now()
        }),
      () => {
        /* best-effort: SOS is already raised even without a fix */
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  if (me.sos) {
    return (
      <button className="sos-fab active" onClick={() => void store.setSos(false)} aria-label="Clear SOS">
        <span className="ic">🆘</span>
        <span className="hint">clear</span>
      </button>
    )
  }

  return (
    <button
      className={holding ? 'sos-fab holding' : 'sos-fab'}
      aria-label="Hold to send SOS"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="sos-fab-fill" />
      <span className="ic">🆘</span>
      <span className="hint">hold</span>
    </button>
  )
}
