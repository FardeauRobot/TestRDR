import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import type { EmblaCarouselType } from 'embla-carousel'
import { useCrew, useStore } from './store/context'
import { SYNC_ENABLED } from './lib/supabase'
import { memberStatus } from './lib/status'
import { liveLocation, useLiveLocation } from './lib/liveLocation'
import { AuthScreen } from './screens/AuthScreen'
import { CrewGate } from './screens/CrewGate'
import { CrewScreen } from './screens/CrewScreen'
import { MemberDetail } from './screens/MemberDetail'
import { LogScreen } from './screens/LogScreen'
import { BulkLogScreen } from './screens/BulkLogScreen'
import { MapScreen } from './screens/MapScreen'
import { InteractionsScreen } from './screens/InteractionsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ManageCrewScreen } from './screens/ManageCrewScreen'
import { OperatorConsole } from './screens/OperatorConsole'
import { SosFab } from './components/SosFab'
import { CheckPrompt } from './components/CheckPrompt'
import type { CrewState } from './store/store'
import { cx } from './lib/util'

type Tab = 'crew' | 'log' | 'map' | 'you'

/** Swipe + tab order. Combos is intentionally NOT here — it's a reference chart,
 *  reached as an overlay from Log and Settings, not a main browsing tab. */
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'crew', label: 'Crew', icon: '👥' },
  { id: 'log', label: 'Log', icon: '➕' },
  { id: 'map', label: 'Map', icon: '🗺️' },
  { id: 'you', label: 'You', icon: '🙂' }
]
const ORDER = TABS.map((t) => t.id)
const indexOf = (t: Tab) => ORDER.indexOf(t)

/** How wide (px from a screen edge) a drag must start to page off the map.
 *  Leaflet eats horizontal drags to pan, so over the map we only honour swipes
 *  that begin in an edge gutter; elsewhere the tab bar is always the fallback. */
const EDGE_PX = 30

/** An invite passed in via a link/QR: ?crew=Name or ?crew=Name&pw=secret.
 *  Pure read (safe under StrictMode's double-invoked initializers) — the
 *  matching scrub of the address bar happens separately, in an effect. */
function readInvite(): { name?: string; password?: string } {
  const params = new URLSearchParams(window.location.search)
  const name = params.get('crew')?.trim() || undefined
  const password = params.get('pw') || undefined
  return { name, password }
}

/** Scrub ?crew=/?pw= from the address bar/history so a scanned password
 *  doesn't linger there. Idempotent, so safe to run more than once. */
function scrubInviteFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('crew') && !params.has('pw')) return
  params.delete('crew')
  params.delete('pw')
  const qs = params.toString()
  const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
  window.history.replaceState(null, '', url)
}

/** A PWA home-screen shortcut deep-link: ?action=log or ?action=sos (see the
 *  manifest `shortcuts` in vite.config.ts). Read once, then scrubbed. */
type Action = 'log' | 'sos'
function readAction(): Action | undefined {
  const a = new URLSearchParams(window.location.search).get('action')
  return a === 'log' || a === 'sos' ? a : undefined
}
function scrubActionFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('action')) return
  params.delete('action')
  const qs = params.toString()
  const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
  window.history.replaceState(null, '', url)
}

export function App() {
  const { account, crew, meId, ready } = useCrew()
  const [invite] = useState(readInvite)
  const [action] = useState(readAction)
  useEffect(() => {
    if (invite.name || invite.password) scrubInviteFromUrl()
    if (action) scrubActionFromUrl()
  }, [invite, action])

  if (!ready) {
    return (
      <div className="app">
        <div className="spinner" />
      </div>
    )
  }
  if (!account) {
    return (
      <div className="app">
        <AuthScreen />
      </div>
    )
  }
  if (!crew) {
    return (
      <div className="app">
        <CrewGate invitedName={invite.name} invitedPassword={invite.password} />
      </div>
    )
  }
  // Signed in and in a crew, but the member isn't set up yet (brief async gap
  // while join auto-creates it) — show a spinner rather than a flash of nothing.
  if (!meId) {
    return (
      <div className="app">
        <div className="spinner" />
      </div>
    )
  }
  return <Shell initialAction={action} />
}

/** Smart landing: open on Log, but flip to Crew if anyone needs attention. A
 *  home-screen shortcut overrides it (Log → Log, SOS → Crew, where the fab is). */
function initialTab(state: CrewState, action?: Action): Tab {
  if (action === 'log') return 'log'
  if (action === 'sos') return 'crew'
  const now = Date.now()
  const attention = state.members.some((m) => {
    if (m.id === state.meId) return false
    const t = memberStatus(m, state.events, now).tone
    return t === 'sos' || t === 'alert'
  })
  return attention ? 'crew' : 'log'
}

/** Don't start an embla drag over the map unless it began in an edge gutter. */
function watchDrag(_embla: EmblaCarouselType, evt: MouseEvent | TouchEvent): boolean {
  const target = evt.target as HTMLElement | null
  if (target?.closest('[data-no-swipe]')) {
    const x = 'touches' in evt && evt.touches.length ? evt.touches[0].clientX : (evt as MouseEvent).clientX
    return x <= EDGE_PX || x >= window.innerWidth - EDGE_PX
  }
  return true
}

function Shell({ initialAction }: { initialAction?: Action }) {
  const state = useCrew()
  const store = useStore()
  const live = useLiveLocation()
  const [tab, setTab] = useState<Tab>(() => initialTab(state, initialAction))
  // An SOS shortcut can't safely auto-fire (hold-to-activate is deliberate) —
  // instead land here and pulse the fab so it's the obvious next thing to press.
  const [sosPulse, setSosPulse] = useState(initialAction === 'sos')
  const [openId, setOpenId] = useState<string | null>(null)
  const [combosOpen, setCombosOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [operatorOpen, setOperatorOpen] = useState(false)
  const [bulkLogOpen, setBulkLogOpen] = useState(false)

  // Own the live-location watch at the app level so sharing survives tab switches
  // and reloads; stop broadcasting when this device leaves the crew.
  useEffect(() => {
    liveLocation.attach(store)
    return () => liveLocation.detach()
  }, [store])

  // Let the SOS-shortcut pulse fade after a few seconds.
  useEffect(() => {
    if (!sosPulse) return
    const t = window.setTimeout(() => setSosPulse(false), 6000)
    return () => window.clearTimeout(t)
  }, [sosPulse])

  const [emblaRef, embla] = useEmblaCarousel({
    startIndex: indexOf(tab),
    align: 'start',
    containScroll: 'trimSnaps',
    watchDrag
  })

  useEffect(() => {
    if (!embla) return
    const onSelect = () => setTab(ORDER[embla.selectedScrollSnap()])
    embla.on('select', onSelect)
    return () => {
      embla.off('select', onSelect)
    }
  }, [embla])

  const goTab = useCallback(
    (t: Tab) => {
      setOpenId(null)
      setCombosOpen(false)
      setManageOpen(false)
      setOperatorOpen(false)
      setBulkLogOpen(false)
      setTab(t)
      embla?.scrollTo(indexOf(t))
    },
    [embla]
  )

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Crew Watch</h1>
          <div className="sub">{titleFor(tab)}</div>
        </div>
        <div className="header-pills">
          {live.sharing && (
            <button className="live-pill" onClick={() => goTab('map')} title="You're sharing live location">
              🟢 Live
            </button>
          )}
          <span className={cx('mode-pill', SYNC_ENABLED && 'synced')}>
            {SYNC_ENABLED ? '🔗 Synced' : '📴 Demo'}
          </span>
        </div>
      </header>

      <main className="main pager" ref={emblaRef}>
        <div className="pager-track">
          <section className="pager-slide">
            <CrewScreen onLog={() => goTab('log')} onOpen={setOpenId} onBulkLog={() => setBulkLogOpen(true)} />
          </section>
          <section className="pager-slide">
            <LogScreen onDone={() => goTab('crew')} onCombos={() => setCombosOpen(true)} />
          </section>
          <section className="pager-slide">
            <MapScreen />
          </section>
          <section className="pager-slide">
            <SettingsScreen
              onCombos={() => setCombosOpen(true)}
              onManage={() => setManageOpen(true)}
              onOperator={() => setOperatorOpen(true)}
            />
          </section>
        </div>
      </main>

      {openId && (
        <div className="overlay">
          <MemberDetail id={openId} onBack={() => setOpenId(null)} />
        </div>
      )}
      {combosOpen && (
        <div className="overlay">
          <div className="detail-top">
            <button className="back-btn" onClick={() => setCombosOpen(false)} aria-label="Back">
              ←
            </button>
            <div style={{ fontWeight: 700 }}>🧪 Combos — interaction chart</div>
          </div>
          <InteractionsScreen />
        </div>
      )}
      {manageOpen && (
        <div className="overlay">
          <ManageCrewScreen onBack={() => setManageOpen(false)} />
        </div>
      )}
      {operatorOpen && (
        <div className="overlay">
          <OperatorConsole onBack={() => setOperatorOpen(false)} />
        </div>
      )}
      {bulkLogOpen && (
        <div className="overlay">
          <BulkLogScreen onBack={() => setBulkLogOpen(false)} onDone={() => setBulkLogOpen(false)} />
        </div>
      )}

      <SosFab pulse={sosPulse} />
      <CheckPrompt />

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => {
            const active = tab === t.id && !openId && !combosOpen && !manageOpen && !operatorOpen && !bulkLogOpen
            return (
              <button key={t.id} className={cx('tab', active && 'active')} onClick={() => goTab(t.id)}>
                <span className="ic">{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function titleFor(tab: Tab): string {
  switch (tab) {
    case 'crew': return 'Who took what, and when'
    case 'log': return 'Log what you took'
    case 'map': return 'Find each other'
    case 'you': return 'Your profile & settings'
  }
}
