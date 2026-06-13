import { useState } from 'react'
import { useCrew, useStore } from '../store/context'
import { SUBSTANCES, getSubstance, DISCLAIMER } from '../lib/substances'
import { activeDoses, checkRedose, comboRisks } from '../lib/status'
import { RISK_META } from '../lib/interactions'
import { cx } from '../lib/util'

export function LogScreen({ onDone }: { onDone: () => void }) {
  const { members, events, meId } = useCrew()
  const store = useStore()
  const me = members.find((m) => m.id === meId)
  const [substanceId, setSubstanceId] = useState<string | null>(null)
  const [dose, setDose] = useState('')
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)

  const now = Date.now()
  const sub = substanceId ? getSubstance(substanceId) : null
  const redose = substanceId && meId ? checkRedose(meId, substanceId, events, now) : null

  // Risky combinations with what's already on board (if this member opted in).
  const warningsOn = me?.mixWarnings !== false
  const risks = substanceId && meId && warningsOn ? comboRisks(substanceId, activeDoses(meId, events, now)) : []
  const hasGate = risks.some((r) => RISK_META[r.level].gate)
  const mustAck = hasGate
  const worstColor = risks.length ? RISK_META[risks[0].level].color : undefined

  function pick(id: string) {
    setSubstanceId(id)
    setAck(false)
  }

  async function submit() {
    if (!substanceId || (mustAck && !ack)) return
    setBusy(true)
    try {
      await store.logConsumption({
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
      <div className="section-title">What did you take?</div>
      <div className="sub-grid">
        {SUBSTANCES.map((s) => (
          <button key={s.id} className={cx('sub-tile', s.id === substanceId && 'selected')} onClick={() => pick(s.id)}>
            <span className="emoji">{s.emoji}</span>
            <span className="label">{s.name}</span>
          </button>
        ))}
      </div>

      {sub && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="field" style={{ marginTop: 0 }}>
            <label>Dose / amount (optional)</label>
            <input
              className="input"
              value={dose}
              placeholder={sub.id === 'alcohol' ? 'e.g. 2 beers' : 'e.g. 100mg, half, one line'}
              onChange={(e) => setDose(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{sub.id === 'other' ? 'What was it? / note' : 'Note (optional)'}</label>
            <input
              className="input"
              value={note}
              placeholder={sub.id === 'other' ? 'name it…' : 'tested? batch? mood?'}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Interaction disclaimer (chart-driven) — gates the log button on Unsafe/Dangerous. */}
          {risks.length > 0 && (
            <div
              className="banner"
              style={{
                marginTop: 14,
                flexDirection: 'column',
                border: `1px solid ${worstColor}66`,
                background: `${worstColor}1f`,
                color: 'var(--text)'
              }}
            >
              <div style={{ fontWeight: 700, display: 'flex', gap: 8 }}>
                <span>{hasGate ? '⛔' : '⚠️'}</span>
                <span>Mixing {sub.name} with what you've already taken</span>
              </div>
              <ul style={{ margin: '10px 0 0', paddingLeft: 2, listStyle: 'none', display: 'grid', gap: 9 }}>
                {risks.map((r) => (
                  <li key={r.other.id}>
                    <span style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{r.other.emoji} <strong>{r.other.name}</strong></span>
                      <span className="risk-pill" style={{ color: RISK_META[r.level].color, borderColor: `${RISK_META[r.level].color}66` }}>
                        {RISK_META[r.level].label}
                      </span>
                    </span>
                    <span className="what" style={{ display: 'block', marginTop: 3, color: 'var(--muted)' }}>{r.reason}</span>
                  </li>
                ))}
              </ul>
              {mustAck && (
                <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, flex: '0 0 auto' }} />
                  <span>I understand the risk and want to log it anyway.</span>
                </label>
              )}
              <div className="what" style={{ marginTop: 10, color: 'var(--muted)' }}>Interaction data: TripSit. Guidance only — not a safety guarantee.</div>
            </div>
          )}

          {/* General per-substance tip (only when not already shouting about a mix). */}
          {sub.caution && risks.length === 0 && (
            <div className="banner info" style={{ marginTop: 14 }}>
              <span>💡</span>
              <span>{sub.caution}</span>
            </div>
          )}

          {redose?.tooSoon && (
            <div className="banner warn" style={{ marginTop: 10 }}>
              <span>⏳</span>
              <span>
                You logged {sub.name} {Math.round(redose.waitedMin)} min ago. The usual caution gap is about{' '}
                {Math.round(redose.waitMin)} min — maybe wait before topping up.
              </span>
            </div>
          )}

          <button
            className={cx('btn lg', hasGate ? 'danger' : 'primary')}
            style={{ marginTop: 14 }}
            disabled={busy || (mustAck && !ack)}
            onClick={submit}
          >
            {busy ? 'Logging…' : mustAck ? `Log ${sub.name} anyway` : `Log ${sub.name} now`}
          </button>
        </div>
      )}

      <div className="disclaimer">{DISCLAIMER}</div>
    </>
  )
}
