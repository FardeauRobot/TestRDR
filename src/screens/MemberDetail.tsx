import { useEffect } from 'react'
import { useCrew, useMe, useMember, useStore } from '../store/context'
import { useNow } from '../lib/useNow'
import { Avatar } from '../components/Avatar'
import { doseTimers, eventsFor, memberStatus, mixAlert } from '../lib/status'
import { getSubstance, isDowner } from '../lib/substances'
import { cx, formatAgo, formatElapsed, minutesSince } from '../lib/util'

const TONE_VAR: Record<string, string> = {
  sos: 'var(--sos)', alert: 'var(--alert)', active: 'var(--active)', ok: 'var(--ok)', idle: 'var(--idle)'
}

function clockTime(at: number): string {
  return new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

export function MemberDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { events, meId } = useCrew()
  const store = useStore()
  const now = useNow(1000)

  const member = useMember(id)
  const me = useMe()

  // If this member was removed while open, bail back to the list.
  useEffect(() => {
    if (!member) onBack()
  }, [member, onBack])
  if (!member) return null

  const status = memberStatus(member, events, now)
  const timers = doseTimers(member.id, events, now)
  const mix = mixAlert(timers.filter((d) => d.active))
  const history = eventsFor(member.id, events)
  const canAdmin = !!me?.isAdmin && member.id !== meId

  async function remove() {
    if (window.confirm(`Remove ${member!.name} from the crew? This deletes their logs too.`)) {
      await store.removeMember(member!.id)
    }
  }

  return (
    <>
      <div className="detail-top">
        <button className="back-btn" onClick={onBack} aria-label="Back">‹</button>
        <Avatar member={member} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row1">
            <span className="name" style={{ fontSize: 18 }}>{member.name}</span>
            {member.isAdmin && <span className="badge-admin">★ admin</span>}
            {member.id === meId && <span className="you-tag">you</span>}
          </div>
          <div className={cx('status', 'tone-' + status.tone)} style={{ paddingLeft: 0 }}>
            <span className={cx('dot', 'fill-' + status.tone)} />
            {status.label} · checked in {formatAgo(member.lastCheckIn, now)}
          </div>
        </div>
      </div>

      {member.sos && (
        <div className="banner warn" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}>
          <span>🆘</span>
          <span><strong>{member.name} is broadcasting SOS.</strong> Get to them if you can.</span>
        </div>
      )}

      {member.status && (
        <div className="statusline" style={{ marginTop: 10 }}>
          <span className="q">📣</span>
          <span className="txt">{member.status}</span>
          {member.statusAt && <span className="when">{formatAgo(member.statusAt, now)}</span>}
        </div>
      )}

      {mix && (
        <div className={cx('banner', mix.level === 'danger' ? 'warn' : 'info')} style={{ marginTop: 10 }}>
          <span>{mix.level === 'danger' ? '⚠️' : '🔀'}</span>
          <span>{mix.text}</span>
        </div>
      )}

      {canAdmin && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="what" style={{ marginBottom: 10 }}>★ Admin actions</div>
          <div className="btn-row">
            {member.sos && (
              <button className="btn" onClick={() => void store.clearMemberSos(member.id)}>Mark safe</button>
            )}
            <button className="btn danger" onClick={() => void remove()}>Remove from crew</button>
          </div>
        </div>
      )}

      <div className="section-title">Timers since last dose</div>
      {timers.length === 0 ? (
        <div className="empty">Nothing logged yet.</div>
      ) : (
        timers.map((d) => {
          const pct = Math.min(1, minutesSince(d.lastAt, now) / d.substance.durationMins)
          const tone = d.active ? (mix?.level === 'danger' && isDowner(d.substance.category) ? 'sos' : 'active') : 'idle'
          return (
            <div key={d.substance.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>{d.substance.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {d.substance.name} {d.count > 1 && <span className="what">· {d.count}× total</span>}
                  </div>
                  <div className="what">{d.active ? 'estimated still active' : 'likely cleared'}</div>
                </div>
                <div className={cx('timer', 'tone-' + tone)}>{formatElapsed(d.lastAt, now)}</div>
              </div>
              <div className="progress">
                <i style={{ width: `${pct * 100}%`, background: TONE_VAR[tone] }} />
              </div>
            </div>
          )
        })
      )}

      <div className="section-title">Full history · {history.length}</div>
      {history.length === 0 ? (
        <div className="empty">No entries yet.</div>
      ) : (
        <div className="card">
          {history.map((e) => {
            const s = getSubstance(e.substanceId)
            return (
              <div key={e.id} className="tl-item">
                <span className="tl-em">{s.emoji}</span>
                <div className="tl-main">
                  <div className="tl-name">{e.note || s.name}{e.dose ? ` · ${e.dose}` : ''}</div>
                  <div className="tl-meta">{clockTime(e.at)} · {formatAgo(e.at, now)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
