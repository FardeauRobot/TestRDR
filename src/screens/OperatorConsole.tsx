import { useCallback, useEffect, useState } from 'react'
import { useCrew, useStore } from '../store/context'
import { useNow } from '../lib/useNow'
import type { CrewSummary } from '../store/store'
import { cx, formatAgo } from '../lib/util'

/** App-wide default retention choices (minutes). 0 = never auto-wipe. */
const GLOBAL_RETENTION: { mins: number; label: string }[] = [
  { mins: 0, label: 'Off' },
  { mins: 60, label: '1h' },
  { mins: 180, label: '3h' },
  { mins: 1440, label: '24h' }
]

/** App-owner console to moderate EVERY crew. Only reachable by an account flagged
 *  `isOperator` (see the `accounts.is_operator` column / admin_* RPCs). Rendered
 *  as a full-screen overlay from Settings; there's no hidden URL or secret. */
export function OperatorConsole({ onBack }: { onBack: () => void }) {
  const { account, globalRetentionMins } = useCrew()
  const store = useStore()
  const now = useNow(30000)
  const [crews, setCrews] = useState<CrewSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retBusy, setRetBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setCrews(await store.listAllCrews())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load crews')
    } finally {
      setBusy(false)
    }
  }, [store])

  useEffect(() => {
    void load()
  }, [load])

  async function setGlobal(mins: number) {
    setRetBusy(true)
    setError(null)
    try {
      await store.setGlobalRetention(mins)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the default')
    } finally {
      setRetBusy(false)
    }
  }

  async function del(c: CrewSummary) {
    const ok = window.confirm(
      `Delete crew “${c.name}” permanently?\n\nThis removes ${c.memberCount} member(s) and ` +
        `${c.eventCount} log(s). It cannot be undone.`
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await store.deleteCrewById(c.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete crew')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="detail-top">
        <button className="back-btn" onClick={onBack} aria-label="Back">‹</button>
        <div style={{ fontWeight: 700 }}>🛡️ All crews</div>
      </div>

      {store.mode === 'demo' ? (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span>📴</span>
          <span>
            <strong>Cross-crew moderation needs synced mode.</strong> There are no shared crews to
            manage in demo mode.
          </span>
        </div>
      ) : !account?.isOperator ? (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span>🔒</span>
          <span>This account isn’t an operator. Ask for operator rights to moderate all crews.</span>
        </div>
      ) : (
        <>
          <div className="section-title">Default location retention</div>
          <div className="card">
            <div className="what" style={{ lineHeight: 1.4 }}>
              App-wide default: locations older than this are auto-wiped for every crew (unless a
              crew sets its own). Crews can override this in their own settings.
            </div>
            <div className="btn-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              {GLOBAL_RETENTION.map((opt) => (
                <button
                  key={opt.mins}
                  className={cx('btn', globalRetentionMins === opt.mins ? '' : 'ghost')}
                  style={{ width: 'auto', padding: '6px 14px' }}
                  disabled={retBusy}
                  onClick={() => void setGlobal(opt.mins)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="what" style={{ margin: '10px 0 4px' }}>
            {crews ? `${crews.length} crew${crews.length === 1 ? '' : 's'}` : 'Loading…'} · newest activity first
            <button className="btn ghost" style={{ width: 'auto', marginLeft: 10, padding: '2px 10px' }} disabled={busy} onClick={() => void load()}>
              ↻ Refresh
            </button>
          </div>

          {error && (
            <div className="banner warn" style={{ marginTop: 10 }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {crews && crews.length === 0 ? (
            <div className="empty">No crews exist yet.</div>
          ) : (
            (crews ?? []).map((c) => (
              <div key={c.id} className="card" style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span className="name" style={{ fontSize: 17 }}>{c.name}</span>
                  <span className="what">active {formatAgo(c.lastActivity, now)}</span>
                </div>
                <div className="what" style={{ marginTop: 4 }}>
                  {c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.eventCount} log
                  {c.eventCount === 1 ? '' : 's'} · created {formatAgo(c.createdAt, now)}
                </div>
                <button className="btn danger" style={{ marginTop: 10 }} disabled={busy} onClick={() => void del(c)}>
                  🗑️ Delete this crew
                </button>
              </div>
            ))
          )}

          <div className="disclaimer">
            Deleting a crew removes everyone's profiles and logs immediately and cannot be undone.
            You can do this because your account has operator rights.
          </div>
        </>
      )}
    </>
  )
}
