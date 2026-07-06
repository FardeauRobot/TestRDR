import { useState } from 'react'
import { supabase, SYNC_ENABLED } from '../lib/supabase'
import { useNow } from '../lib/useNow'
import { formatAgo } from '../lib/util'

/** One crew as returned by the `admin_list_crews` RPC. */
interface CrewRow {
  id: string
  name: string
  created_at: string
  member_count: number
  event_count: number
  last_activity: string
}

/** App-owner moderation console for EVERY crew. Reached only via `?admin` in the
 *  URL (deliberately hidden — it's not part of the normal navigation). Crews are
 *  RLS-locked, so this talks to security-definer RPCs gated by an operator secret
 *  the owner types in; nothing here works until that secret is set in the DB. */
export function OperatorConsole() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [crews, setCrews] = useState<CrewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow(30000)

  function exit() {
    window.location.href = import.meta.env.BASE_URL || '/'
  }

  async function load() {
    if (!supabase || !secret) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_list_crews', { p_secret: secret })
    setBusy(false)
    if (error) {
      setError(humanize(error.message))
      return
    }
    setAuthed(true)
    setCrews((data ?? []) as CrewRow[])
  }

  async function del(c: CrewRow) {
    if (!supabase) return
    const ok = window.confirm(
      `Delete crew “${c.name}” permanently?\n\nThis removes ${Number(c.member_count)} member(s) and ` +
        `${Number(c.event_count)} log(s). It cannot be undone.`
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('admin_delete_crew_by_id', { p_secret: secret, p_crew_id: c.id })
    setBusy(false)
    if (error) {
      setError(humanize(error.message))
      return
    }
    await load()
  }

  if (!SYNC_ENABLED) {
    return (
      <Frame onExit={exit}>
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span>📴</span>
          <span>
            <strong>Operator console needs synced mode.</strong> There are no shared crews to
            moderate in demo mode — set the Supabase env vars and reload.
          </span>
        </div>
      </Frame>
    )
  }

  if (!authed) {
    return (
      <Frame onExit={exit}>
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Operator secret</div>
          <div className="what" style={{ lineHeight: 1.4, marginBottom: 10 }}>
            Enter the operator secret to list and moderate every crew. This is separate from any
            crew password. If it hasn't been set in the database yet, the console stays locked.
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void load()
            }}
          >
            <input
              className="input"
              type="password"
              value={secret}
              placeholder="operator secret"
              autoFocus
              onChange={(e) => setSecret(e.target.value)}
            />
            {error && (
              <div className="banner warn" style={{ marginTop: 10 }}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}
            <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !secret} type="submit">
              {busy ? 'Checking…' : 'Unlock console'}
            </button>
          </form>
        </div>
      </Frame>
    )
  }

  return (
    <Frame onExit={exit}>
      <div className="what" style={{ margin: '10px 0 4px' }}>
        {crews.length} crew{crews.length === 1 ? '' : 's'} · sorted by most recent activity
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

      {crews.length === 0 ? (
        <div className="empty">No crews exist yet.</div>
      ) : (
        crews.map((c) => (
          <div key={c.id} className="card" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span className="name" style={{ fontSize: 17 }}>{c.name}</span>
              <span className="what">active {formatAgo(new Date(c.last_activity).getTime(), now)}</span>
            </div>
            <div className="what" style={{ marginTop: 4 }}>
              {Number(c.member_count)} member{Number(c.member_count) === 1 ? '' : 's'} ·{' '}
              {Number(c.event_count)} log{Number(c.event_count) === 1 ? '' : 's'} · created{' '}
              {formatAgo(new Date(c.created_at).getTime(), now)}
            </div>
            <button className="btn danger" style={{ marginTop: 10 }} disabled={busy} onClick={() => void del(c)}>
              🗑️ Delete this crew
            </button>
          </div>
        ))
      )}

      <div className="disclaimer">
        Deleting a crew removes everyone's profiles and logs immediately and cannot be undone.
        The operator secret authorises every action above — keep it private.
      </div>
    </Frame>
  )
}

function Frame({ children, onExit }: { children: React.ReactNode; onExit: () => void }) {
  return (
    <>
      <div className="detail-top">
        <button className="back-btn" onClick={onExit} aria-label="Exit">‹</button>
        <div style={{ fontWeight: 700 }}>🛡️ Operator console</div>
      </div>
      {children}
    </>
  )
}

/** Strip Postgres prefixes so the operator sees a clean message. */
function humanize(msg: string): string {
  return msg.replace(/^.*(?:exception|error):\s*/i, '').trim() || 'Something went wrong'
}
