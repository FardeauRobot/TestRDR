import { useState } from 'react'
import { useCrew, useMe, useStore } from '../store/context'
import { Avatar } from '../components/Avatar'
import { SUBSTANCES, getSubstance, DISCLAIMER } from '../lib/substances'
import { cx } from '../lib/util'

/** Admin-only: log the same consumption for several members in one go, e.g. a
 *  group that just took the same thing together. Skips each member's own
 *  mixing/re-dose warnings (there's no single "on board" history to check
 *  against a group), so it trades personalised safety checks for speed —
 *  only meant for a trusted admin who already knows what's being logged. */
export function BulkLogScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { members, meId } = useCrew()
  const store = useStore()
  const me = useMe()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [substanceId, setSubstanceId] = useState<string | null>(null)
  const [dose, setDose] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (!me?.isAdmin) {
    return (
      <>
        <Header onBack={onBack} />
        <div className="empty">Admin access only.</div>
      </>
    )
  }

  const others = members.filter((m) => m.id !== meId)
  const sub = substanceId ? getSubstance(substanceId) : null

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!substanceId || selected.size === 0) return
    setBusy(true)
    try {
      await store.logConsumptionFor([...selected], {
        substanceId,
        dose: dose.trim() || undefined,
        note: note.trim() || undefined
      })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Header onBack={onBack} />

      <div className="what" style={{ margin: '2px 0 10px', lineHeight: 1.4 }}>
        Pick who, then what — this logs the same dose for everyone selected at once, as if each
        of them had logged it themselves.
      </div>

      <div className="section-title">
        Who took it? {selected.size > 0 && `· ${selected.size} selected`}
      </div>
      {others.length === 0 ? (
        <div className="empty">No one else has joined yet.</div>
      ) : (
        <>
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button className="btn ghost" onClick={() => setSelected(new Set(others.map((m) => m.id)))}>
              Select all
            </button>
            <button className="btn ghost" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
          <div className="bulk-member-grid">
            {others.map((m) => {
              const on = selected.has(m.id)
              return (
                <button key={m.id} className={cx('bulk-member', on && 'selected')} onClick={() => toggle(m.id)}>
                  <Avatar member={m} />
                  <span className="name">{m.name}</span>
                  {on && <span className="check">✓</span>}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="section-title">What did they take?</div>
      <div className="sub-grid">
        {SUBSTANCES.map((s) => (
          <button
            key={s.id}
            className={cx('sub-tile', s.id === substanceId && 'selected')}
            onClick={() => setSubstanceId(s.id)}
          >
            <span className="emoji">{s.emoji}</span>
            <span className="label">{s.name}</span>
          </button>
        ))}
      </div>

      {sub && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="field" style={{ marginTop: 0 }}>
            <label>Dose / amount (optional, applied to everyone)</label>
            <input
              className="input"
              value={dose}
              placeholder={sub.id === 'alcohol' ? 'e.g. 2 beers' : 'e.g. 100mg, half, one line'}
              onChange={(e) => setDose(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{sub.id === 'other' ? 'What was it? / note' : 'Note (optional)'}</label>
            <input className="input" value={note} placeholder="tested? batch?" onChange={(e) => setNote(e.target.value)} />
          </div>

          {sub.caution && (
            <div className="banner info" style={{ marginTop: 14 }}>
              <span>💡</span>
              <span>{sub.caution}</span>
            </div>
          )}

          <div className="banner warn" style={{ marginTop: 10 }}>
            <span>⚠️</span>
            <span>
              This skips each person's own mixing and re-dose warnings — only use it when you're
              already sure it's safe for everyone selected.
            </span>
          </div>

          <button
            className="btn lg primary"
            style={{ marginTop: 14 }}
            disabled={busy || selected.size === 0}
            onClick={() => void submit()}
          >
            {busy
              ? 'Logging…'
              : `Log ${sub.name} for ${selected.size} member${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      <div className="disclaimer">{DISCLAIMER}</div>
    </>
  )
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="detail-top">
      <button className="back-btn" onClick={onBack} aria-label="Back">‹</button>
      <div style={{ fontWeight: 700 }}>👥➕ Log for others</div>
    </div>
  )
}
