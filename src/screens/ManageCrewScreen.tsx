import { useState } from 'react'
import { useCrew, useMe, useStore } from '../store/context'
import { useNow } from '../lib/useNow'
import { Avatar } from '../components/Avatar'
import { memberStatus, TONE_PRIORITY } from '../lib/status'
import { cx, formatAgo } from '../lib/util'

/** Admin-only console for moderating a single crew: manage members' roles,
 *  clear SOS, remove people, and delete the whole crew. Reached from Settings
 *  and rendered as a full-screen overlay (like MemberDetail). */
export function ManageCrewScreen({ onBack }: { onBack: () => void }) {
  const { crew, members, events, meId } = useCrew()
  const store = useStore()
  const now = useNow(5000)
  const me = useMe()

  const [busyId, setBusyId] = useState<string | null>(null)
  const [delOpen, setDelOpen] = useState(false)
  const [delPwd, setDelPwd] = useState('')
  const [delErr, setDelErr] = useState<string | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  // Only admins get here; bail defensively if that changes underfoot.
  if (!me?.isAdmin) {
    return (
      <>
        <Header onBack={onBack} name={crew?.name} />
        <div className="empty">Admin access only.</div>
      </>
    )
  }

  const adminCount = members.filter((m) => m.isAdmin).length
  // Attention first, then admins, then alphabetical — the people to act on float up.
  const sorted = [...members].sort((a, b) => {
    const ta = TONE_PRIORITY[memberStatus(a, events, now).tone]
    const tb = TONE_PRIORITY[memberStatus(b, events, now).tone]
    if (ta !== tb) return ta - tb
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id)
    try {
      await fn()
    } finally {
      setBusyId(null)
    }
  }

  async function toggleAdmin(id: string, makeAdmin: boolean) {
    // Never leave a crew with no admin.
    if (!makeAdmin && adminCount <= 1) {
      window.alert('This is the crew’s only admin. Promote someone else first.')
      return
    }
    await run(id, () => store.setAdmin(id, makeAdmin))
  }

  async function remove(id: string, name: string, isAdmin: boolean) {
    if (isAdmin && adminCount <= 1) {
      window.alert('You can’t remove the crew’s only admin. Promote someone else first.')
      return
    }
    if (window.confirm(`Remove ${name} from the crew? This deletes their logs too.`)) {
      await run(id, () => store.removeMember(id))
    }
  }

  async function deleteCrew() {
    setDelErr(null)
    setDelBusy(true)
    try {
      await store.deleteCrew(delPwd) // on success the store clears the crew → app returns to the gate
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : 'Could not delete crew')
    } finally {
      setDelBusy(false)
    }
  }

  return (
    <>
      <Header onBack={onBack} name={crew?.name} />

      <div className="what" style={{ margin: '2px 0 10px' }}>
        {members.length} member{members.length === 1 ? '' : 's'} · {adminCount} admin
        {adminCount === 1 ? '' : 's'}
      </div>

      {sorted.map((m) => {
        const st = memberStatus(m, events, now)
        const isMe = m.id === meId
        const busy = busyId === m.id
        return (
          <div key={m.id} className="card" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar member={m} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row1">
                  <span className="name">{m.name}</span>
                  {m.isAdmin && <span className="badge-admin">★ admin</span>}
                  {isMe && <span className="you-tag">you</span>}
                </div>
                <div className={cx('status', 'tone-' + st.tone)} style={{ paddingLeft: 0 }}>
                  <span className={cx('dot', 'fill-' + st.tone)} />
                  {st.label} · {formatAgo(m.lastCheckIn, now)}
                </div>
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              {m.sos && (
                <button className="btn" disabled={busy} onClick={() => void run(m.id, () => store.clearMemberSos(m.id))}>
                  Mark safe
                </button>
              )}
              {m.isAdmin ? (
                <button className="btn ghost" disabled={busy || (isMe && adminCount <= 1)} onClick={() => void toggleAdmin(m.id, false)}>
                  Remove admin
                </button>
              ) : (
                <button className="btn ghost" disabled={busy} onClick={() => void toggleAdmin(m.id, true)}>
                  Make admin
                </button>
              )}
              {!isMe && (
                <button className="btn danger" disabled={busy} onClick={() => void remove(m.id, m.name, m.isAdmin)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        )
      })}

      <div className="section-title">Danger zone</div>
      {!delOpen ? (
        <button className="btn ghost" style={{ color: 'var(--sos)' }} onClick={() => setDelOpen(true)}>
          🗑️ Delete crew for everyone
        </button>
      ) : (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ fontWeight: 700, color: 'var(--sos)' }}>Delete “{crew?.name}” permanently?</div>
          <div className="what" style={{ marginTop: 6, lineHeight: 1.4 }}>
            This removes the crew and <strong>everyone's</strong> profiles and logs. It can't be undone.
            Enter the crew password to confirm.
          </div>
          <input
            className="input"
            type="password"
            value={delPwd}
            placeholder="crew password"
            style={{ marginTop: 10 }}
            onChange={(e) => setDelPwd(e.target.value)}
          />
          {delErr && (
            <div className="banner warn" style={{ marginTop: 10 }}>
              <span>⚠️</span>
              <span>{delErr}</span>
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => { setDelOpen(false); setDelPwd(''); setDelErr(null) }}>
              Cancel
            </button>
            <button className="btn danger" disabled={delBusy || !delPwd} onClick={() => void deleteCrew()}>
              {delBusy ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}

      <div className="disclaimer">
        Admin actions here take effect for the whole crew immediately. Removing someone
        deletes their logs; promoting someone gives them these same powers.
      </div>
    </>
  )
}

function Header({ onBack, name }: { onBack: () => void; name?: string }) {
  return (
    <div className="detail-top">
      <button className="back-btn" onClick={onBack} aria-label="Back">‹</button>
      <div style={{ fontWeight: 700 }}>★ Manage {name ? `“${name}”` : 'crew'}</div>
    </div>
  )
}
