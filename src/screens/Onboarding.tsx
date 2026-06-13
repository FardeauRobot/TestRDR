import { useState } from 'react'
import { useCrew, useStore } from '../store/context'
import { cx } from '../lib/util'
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../lib/avatar'
import { SYNC_ENABLED } from '../lib/supabase'

export function Onboarding() {
  const store = useStore()
  const { crew } = useCrew()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(AVATAR_EMOJIS[0])
  const [color, setColor] = useState(AVATAR_COLORS[0])
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await store.createProfile({ name: name.trim(), emoji, color })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div className="brand-lg">{crew ? crew.name : 'Crew Watch'}</div>
      <p className="lead">
        You're in <strong>{crew?.name}</strong>. Set up how you'll appear to the
        crew, then start logging and looking out for each other.
        {crew && (
          <>
            {' '}
            <button
              onClick={() => void store.leaveCrew()}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 0, textDecoration: 'underline' }}
            >
              Not your crew?
            </button>
          </>
        )}
      </p>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="field" style={{ marginTop: 0 }}>
          <label>Your name (just for the crew)</label>
          <input
            className="input"
            value={name}
            maxLength={20}
            placeholder="e.g. Robin"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label>Pick an avatar</label>
          <div className="chip-row">
            {AVATAR_EMOJIS.map((e) => (
              <button key={e} className={cx('chip', e === emoji && 'selected')} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Colour</label>
          <div className="chip-row">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                className={cx('swatch', c === color && 'selected')}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </div>

      <button className="btn primary lg" style={{ marginTop: 14 }} disabled={!name.trim() || busy} onClick={submit}>
        {busy ? 'Setting up…' : 'Join the crew'}
      </button>

      <div className="disclaimer">
        {SYNC_ENABLED
          ? 'Synced mode: your crew shares one private space. '
          : 'Demo mode: this device only, with sample crew mates so you can try it. '}
        This app reduces risk but never removes it. Test your substances, go slow,
        never mix depressants, and never use alone.
      </div>
    </div>
  )
}
