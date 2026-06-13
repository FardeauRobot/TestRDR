import { useState } from 'react'
import { useCrew } from './store/context'
import { SYNC_ENABLED } from './lib/supabase'
import { CrewGate } from './screens/CrewGate'
import { Onboarding } from './screens/Onboarding'
import { CrewScreen } from './screens/CrewScreen'
import { MemberDetail } from './screens/MemberDetail'
import { LogScreen } from './screens/LogScreen'
import { MapScreen } from './screens/MapScreen'
import { InteractionsScreen } from './screens/InteractionsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { cx } from './lib/util'

type Tab = 'crew' | 'log' | 'map' | 'combos' | 'you'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'crew', label: 'Crew', icon: '👥' },
  { id: 'log', label: 'Log', icon: '➕' },
  { id: 'map', label: 'Map', icon: '🗺️' },
  { id: 'combos', label: 'Combos', icon: '🧪' },
  { id: 'you', label: 'You', icon: '🙂' }
]

/** A crew name passed in via an invite link: ?crew=Name */
function invitedCrewName(): string | undefined {
  const v = new URLSearchParams(window.location.search).get('crew')
  return v ? v.trim() : undefined
}

export function App() {
  const { crew, meId, ready } = useCrew()
  const [tab, setTab] = useState<Tab>('crew')
  const [openId, setOpenId] = useState<string | null>(null)

  function goTab(t: Tab) {
    setOpenId(null)
    setTab(t)
  }

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

      <main className="main">
        {openId ? (
          <MemberDetail id={openId} onBack={() => setOpenId(null)} />
        ) : (
          <>
            {tab === 'crew' && <CrewScreen onLog={() => setTab('log')} onOpen={setOpenId} />}
            {tab === 'log' && <LogScreen onDone={() => setTab('crew')} />}
            {tab === 'map' && <MapScreen />}
            {tab === 'combos' && <InteractionsScreen />}
            {tab === 'you' && <SettingsScreen />}
          </>
        )}
      </main>

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={cx('tab', tab === t.id && !openId && 'active')} onClick={() => goTab(t.id)}>
              <span className="ic">{t.icon}</span>
              {t.label}
            </button>
          ))}
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
    case 'combos': return 'Drug interaction chart'
    case 'you': return 'Your profile & settings'
  }
}
