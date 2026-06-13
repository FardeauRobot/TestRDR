import { useState } from 'react'
import { useCrew, useMe, useStore } from '../store/context'
import { Avatar } from '../components/Avatar'
import { SYNC_ENABLED } from '../lib/supabase'
import { getSubstance } from '../lib/substances'
import { eventsFor } from '../lib/status'
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../lib/avatar'
import { useNow } from '../lib/useNow'
import { formatAgo, cx } from '../lib/util'

export function SettingsScreen({ onCombos }: { onCombos: () => void }) {
  const { crew, events } = useCrew()
  const store = useStore()
  const now = useNow(10000)
  const me = useMe()
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delPwd, setDelPwd] = useState('')
  const [delErr, setDelErr] = useState<string | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  if (!me) return null

  async function deleteCrew() {
    setDelErr(null)
    setDelBusy(true)
    try {
      await store.deleteCrew(delPwd)
      // On success the store clears the crew → app returns to the gate.
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : 'Could not delete crew')
    } finally {
      setDelBusy(false)
    }
  }

  async function invite() {
    if (!crew) return
    const link = `${window.location.origin}${import.meta.env.BASE_URL}?crew=${encodeURIComponent(crew.name)}`
    const text = `Join "${crew.name}" on Crew Watch: ${link}\nAsk me for the crew password.`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my crew on Crew Watch', text, url: link })
      } else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      /* user cancelled share */
    }
  }

  const myEvents = eventsFor(me.id, events).slice(0, 8)

  return (
    <>
      <div className="card" style={{ marginTop: 6, display: 'flex', gap: 14, alignItems: 'center' }}>
        <Avatar member={me} size="lg" />
        <div style={{ flex: 1 }}>
          <div className="row1">
            <span className="name" style={{ fontSize: 20, fontWeight: 700 }}>{me.name}</span>
            {me.isAdmin && <span className="badge-admin">★ admin</span>}
          </div>
          <div className="what">
            Checked in {formatAgo(me.lastCheckIn, now)}
            {me.isAdmin && ' · tap a crew member to manage them'}
          </div>
        </div>
        <button className="btn ghost" style={{ width: 'auto' }} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {editing && <EditProfile />}

      <div className="section-title">Your recent log</div>
      {myEvents.length === 0 ? (
        <div className="empty">Nothing logged yet.</div>
      ) : (
        <div className="card">
          {myEvents.map((e, i) => {
            const s = getSubstance(e.substanceId)
            return (
              <div key={e.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 20 }}>{s.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{e.note || s.name}{e.dose ? ` · ${e.dose}` : ''}</div>
                  <div className="what">{formatAgo(e.at, now)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="section-title">Safety</div>
      <div className="card">
        <div className="toggle-row">
          <div className="label">
            <div style={{ fontWeight: 600 }}>Warn before risky mixes</div>
            <div className="what" style={{ marginTop: 2, lineHeight: 1.4 }}>
              Show a disclaimer when you log something known to be dangerous with what you've already taken.
            </div>
          </div>
          <button
            className={cx('toggle', me.mixWarnings && 'on')}
            role="switch"
            aria-checked={me.mixWarnings}
            aria-label="Warn before risky mixes"
            onClick={() => void store.setMixWarnings(!me.mixWarnings)}
          >
            <span />
          </button>
        </div>
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={onCombos}>
          🧪 Interaction chart
        </button>
      </div>

      <div className="section-title">Crew</div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="what">You're in</span>
          <span style={{ fontWeight: 700 }}>{crew?.name}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span className="what">Mode</span>
          <span className={cx('mode-pill', SYNC_ENABLED && 'synced')}>
            {SYNC_ENABLED ? '🔗 Synced' : '📴 Demo (this device)'}
          </span>
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => void invite()}>
          {copied ? '✅ Invite copied' : '🔗 Invite someone'}
        </button>
        <div className="what" style={{ marginTop: 8, lineHeight: 1.4 }}>
          The link prefills the crew name — share the password separately so only
          people you trust can join.
        </div>
      </div>

      <button className="btn ghost" style={{ marginTop: 16, color: 'var(--sos)' }} onClick={() => void store.leaveCrew()}>
        Leave crew on this device
      </button>

      {me.isAdmin && (
        <>
          {!delOpen ? (
            <button className="btn ghost" style={{ marginTop: 10, color: 'var(--sos)' }} onClick={() => setDelOpen(true)}>
              🗑️ Delete crew for everyone
            </button>
          ) : (
            <div className="card" style={{ marginTop: 10, borderColor: 'rgba(239,68,68,0.4)' }}>
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
        </>
      )}

      <div className="disclaimer">
        Crew Watch helps you look out for each other — it doesn't replace good judgement, naloxone,
        testing kits, or calling emergency services when someone is in trouble.
      </div>
    </>
  )
}

function EditProfile() {
  const store = useStore()
  const me = useMe()!
  const [name, setName] = useState(me.name)

  return (
    <div className="card">
      <div className="field" style={{ marginTop: 0 }}>
        <label>Name</label>
        <input
          className="input"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== me.name && void store.updateProfile({ name: name.trim() })}
        />
      </div>
      <div className="field">
        <label>Avatar</label>
        <div className="chip-row">
          {AVATAR_EMOJIS.map((em) => (
            <button key={em} className={cx('chip', em === me.emoji && 'selected')} onClick={() => void store.updateProfile({ emoji: em })}>
              {em}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Colour</label>
        <div className="chip-row">
          {AVATAR_COLORS.map((c) => (
            <button key={c} className={cx('swatch', c === me.color && 'selected')} style={{ background: c }} onClick={() => void store.updateProfile({ color: c })} aria-label={c} />
          ))}
        </div>
      </div>
    </div>
  )
}
