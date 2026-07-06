import { useCrew, useMe, useStore } from '../store/context'
import { useNow } from '../lib/useNow'
import { MemberCard } from '../components/MemberCard'
import { StatusEditor } from '../components/StatusEditor'
import { memberStatus, TONE_PRIORITY } from '../lib/status'
import { formatAgo } from '../lib/util'

export function CrewScreen({ onLog, onOpen }: { onLog: () => void; onOpen: (id: string) => void }) {
  const { members, events, meId } = useCrew()
  const store = useStore()
  const now = useNow(1000)

  const me = useMe()
  const others = members.filter((m) => m.id !== meId)

  const sorted = [...others].sort((a, b) => {
    const pa = TONE_PRIORITY[memberStatus(a, events, now).tone]
    const pb = TONE_PRIORITY[memberStatus(b, events, now).tone]
    return pa - pb
  })

  const needAttention = others.filter((m) => {
    const t = memberStatus(m, events, now).tone
    return t === 'sos' || t === 'alert'
  })

  return (
    <>
      {store.mode === 'demo' && (
        <div className="banner warn" style={{ marginTop: 6 }}>
          <span>📴</span>
          <span>
            <strong>Demo mode — not syncing.</strong> Data stays on this phone only and others
            won't appear. Connect Supabase (see DEPLOY.md) to sync your real crew.
          </span>
        </div>
      )}
      {me && (
        <div className="card" style={{ marginTop: 6 }}>
          <MemberCard member={me} events={events} now={now} isMe />
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => void store.checkIn()}>
              ✅ I'm OK
            </button>
            <button className="btn" onClick={onLog}>➕ Log</button>
          </div>
          <StatusEditor />
          <div className="what" style={{ marginTop: 8, textAlign: 'center' }}>
            Last check-in {formatAgo(me.lastCheckIn, now)}
          </div>
        </div>
      )}

      {needAttention.length > 0 && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span>⚠️</span>
          <span>
            {needAttention.map((m) => m.name).join(', ')} might need a check — say hi or head over.
          </span>
        </div>
      )}

      <div className="section-title">Crew · {others.length}</div>
      {sorted.length === 0 ? (
        <div className="empty">No one else has joined yet.<br />Share the app with your crew.</div>
      ) : (
        sorted.map((m) => <MemberCard key={m.id} member={m} events={events} now={now} onOpen={onOpen} />)
      )}
    </>
  )
}
