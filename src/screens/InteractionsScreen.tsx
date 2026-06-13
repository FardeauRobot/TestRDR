import { useState } from 'react'
import { CHARTED, chartFor, RISK_META, interactionReason, type RiskLevel } from '../lib/interactions'
import { cx } from '../lib/util'

const LEGEND: RiskLevel[] = ['dangerous', 'unsafe', 'caution', 'synergy', 'neutral', 'decrease']

export function InteractionsScreen() {
  const [selected, setSelected] = useState<string | null>(null)
  const entries = selected ? chartFor(selected) : []
  const sel = CHARTED.find((s) => s.id === selected)

  return (
    <>
      <div className="banner info" style={{ marginTop: 6 }}>
        <span>🧪</span>
        <span>Pick a substance to see how it combines with everything else. Based on the TripSit chart — guidance, never a safety guarantee.</span>
      </div>

      <div className="legend">
        {LEGEND.map((lvl) => (
          <span key={lvl} className="risk-pill" style={{ color: RISK_META[lvl].color, borderColor: `${RISK_META[lvl].color}66` }}>
            {RISK_META[lvl].short}
          </span>
        ))}
      </div>

      <div className="section-title">Choose a substance</div>
      <div className="sub-grid">
        {CHARTED.map((s) => (
          <button key={s.id} className={cx('sub-tile', s.id === selected && 'selected')} onClick={() => setSelected(s.id)}>
            <span className="emoji">{s.emoji}</span>
            <span className="label">{s.name}</span>
          </button>
        ))}
      </div>

      {sel && (
        <>
          <div className="section-title">{sel.emoji} {sel.name} combined with…</div>
          <div className="card">
            {entries.map((e) => {
              const meta = RISK_META[e.level]
              return (
                <div key={e.other.id} className="risk-row">
                  <span className="risk-bar" style={{ background: meta.color }} />
                  <span className="em">{e.other.emoji}</span>
                  <span className="nm">
                    <div style={{ fontWeight: 600 }}>{e.other.name}</div>
                    <div className="what" style={{ marginTop: 2 }}>{interactionReason(sel.id, e.other.id, e.level)}</div>
                  </span>
                  <span className="risk-pill" style={{ color: meta.color, borderColor: `${meta.color}66` }}>{meta.short}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="disclaimer">
        Interaction data adapted from TripSit's drug combinations chart (community-maintained,
        CC BY-NC-SA). Many substances and research chemicals aren't covered here — when in doubt,
        check TripSit / PsychonautWiki and assume caution.
      </div>
    </>
  )
}
