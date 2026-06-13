import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import type { EmblaCarouselType } from 'embla-carousel'
import { useCrew } from './store/context'
import { SYNC_ENABLED } from './lib/supabase'
import { memberStatus } from './lib/status'
import { CrewGate } from './screens/CrewGate'
import { Onboarding } from './screens/Onboarding'
import { CrewScreen } from './screens/CrewScreen'
import { MemberDetail } from './screens/MemberDetail'
import { LogScreen } from './screens/LogScreen'
import { MapScreen } from './screens/MapScreen'
import { InteractionsScreen } from './screens/InteractionsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SosFab } from './components/SosFab'
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

/** A crew name passed in via an invite link: ?crew=Name */
function invitedCrewName(): string | undefined {
  const v = new URLSearchParams(window.location.search).get('crew')
  return v ? v.trim() : undefined
}

export function App() {
  const { crew, meId, ready } = useCrew()

  if (!ready) {
    return (
      <div className="app">
        <div className="spinner" />
      </div>
    )
  }
  if (!crew) {
    return (
      <div className="app">
        <CrewGate invitedName={invitedCrewName()} />
      </div>
    )
  }
  if (!meId) {
    return (
      <div className="app">
        <Onboarding />
      </div>
    )
  }
  return <Shell />
}

/** Smart landing: open on Log, but flip to Crew if anyone needs attention. */
function initialTab(state: CrewState): Tab {
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

function Shell() {
  const state = useCrew()
  const [tab, setTab] = useState<Tab>(() => initialTab(state))
  const [openId, setOpenId] = useState<string | null>(null)
  const [combosOpen, setCombosOpen] = useState(false)

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
        <span className={cx('mode-pill', SYNC_ENABLED && 'synced')}>
          {SYNC_ENABLED ? '🔗 Synced' : '📴 Demo'}
        </span>
      </header>

      <main className="main pager" ref={emblaRef}>
        <div className="pager-track">
          <section className="pager-slide">
            <CrewScreen onLog={() => goTab('log')} onOpen={setOpenId} />
          </section>
          <section className="pager-slide">
            <LogScreen onDone={() => goTab('crew')} onCombos={() => setCombosOpen(true)} />
          </section>
          <section className="pager-slide">
            <MapScreen />
          </section>
          <section className="pager-slide">
            <SettingsScreen onCombos={() => setCombosOpen(true)} />
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

      <SosFab />

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => {
            const active = tab === t.id && !openId && !combosOpen
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
