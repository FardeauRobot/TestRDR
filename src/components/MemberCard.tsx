import type { ConsumptionEvent, Member } from '../types'
import { Avatar } from './Avatar'
import { doseTimers, memberStatus, mixAlert, type DoseTimer } from '../lib/status'
import { isDowner } from '../lib/substances'
import { cx, formatAgo, formatElapsed } from '../lib/util'

/** A row of "since last <substance>" timer chips. */
export function DoseChips({ doses, now, max }: { doses: DoseTimer[]; now: number; max?: number }) {
  const shown = max ? doses.slice(0, max) : doses
  const extra = max ? doses.length - shown.length : 0
  return (
    <div className="tchips">
      {shown.map((d) => (
        <span
          key={d.substance.id}
          className={cx('tchip', !d.active && 'faded', d.active && isDowner(d.substance.category) && 'down')}
        >
          <span className="t-em">{d.substance.emoji}</span>
          <span className="t-time">{formatElapsed(d.lastAt, now)}</span>
          {d.count > 1 && <span className="t-count">×{d.count}</span>}
        </span>
      ))}
      {extra > 0 && <span className="tchip faded">+{extra}</span>}
    </div>
  )
}

export function MemberCard({
  member,
  events,
  now,
  isMe,
  onOpen
}: {
  member: Member
  events: ConsumptionEvent[]
  now: number
  isMe?: boolean
  onOpen?: (id: string) => void
}) {
  const status = memberStatus(member, events, now)
  const all = doseTimers(member.id, events, now)
  const active = all.filter((d) => d.active)
  const mix = mixAlert(active)

  // Prefer active timers; if nothing active, show the most recent ones faded.
  const chips = active.length > 0 ? active : all.slice(0, 3)

  return (
    <div
      className={cx('card member', member.sos && 'is-sos', onOpen && 'clickable')}
      onClick={onOpen ? () => onOpen(member.id) : undefined}
    >
      <Avatar member={member} />
      <div className="body">
        <div className="row1">
          <span className="name">{member.name}</span>
          {member.isAdmin && <span className="badge-admin">★ admin</span>}
          {isMe && <span className="you-tag">you</span>}
        </div>
        <div className={cx('status', 'tone-' + status.tone)} style={{ paddingLeft: 0, marginTop: 2 }}>
          <span className={cx('dot', 'fill-' + status.tone)} />
          {status.label}
        </div>
        {chips.length > 0 ? (
          <DoseChips doses={chips} now={now} max={4} />
        ) : (
          <div className="what">Nothing logged yet</div>
        )}
        {mix && (
          <div className={cx('mix-line', mix.level)}>
            <span>{mix.level === 'danger' ? '⚠️' : '🔀'}</span>
            <span>{mix.text}</span>
          </div>
        )}
        {member.status && (
          <div className="statusline">
            <span className="q">📣</span>
            <span className="txt">{member.status}</span>
            {member.statusAt && <span className="when">{formatAgo(member.statusAt, now)}</span>}
          </div>
        )}
      </div>
      {onOpen && <span className="chev">›</span>}
    </div>
  )
}
