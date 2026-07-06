import { useState } from 'react'
import { useStore } from '../store/context'
import { SYNC_ENABLED } from '../lib/supabase'
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../lib/avatar'
import { cx } from '../lib/util'

/** First screen when signed out: create an account or log in with nickname +
 *  password. The account carries your nickname + avatar, so once you're in a
 *  crew there's no separate onboarding step. */
export function AuthScreen() {
  const store = useStore()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [emoji, setEmoji] = useState(AVATAR_EMOJIS[0])
  const [color, setColor] = useState(AVATAR_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = nickname.trim().length >= 2 && password.length >= 4

  async function submit() {
    if (!canSubmit) return
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') await store.signup(nickname.trim(), password, emoji, color)
      else await store.login(nickname.trim(), password)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div className="brand-lg">Crew&nbsp;Watch</div>
      <p className="lead">
        {mode === 'signup'
          ? 'Create an account — a nickname and password you’ll use to sign in. This is how your crew will know you.'
          : 'Welcome back. Sign in with your nickname and password.'}
      </p>

      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className={cx('btn', mode === 'signup' ? 'primary' : 'ghost')} onClick={() => setMode('signup')}>
          Create account
        </button>
        <button className={cx('btn', mode === 'login' ? 'primary' : 'ghost')} onClick={() => setMode('login')}>
          Log in
        </button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="field" style={{ marginTop: 0 }}>
          <label>Nickname</label>
          <input
            className="input"
            value={nickname}
            maxLength={20}
            placeholder="e.g. Robin"
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            placeholder={mode === 'signup' ? 'at least 4 characters' : 'your password'}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
          />
        </div>

        {mode === 'signup' && (
          <>
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
          </>
        )}

        {error && (
          <div className="banner warn" style={{ marginTop: 14 }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <button className="btn primary lg" style={{ marginTop: 14 }} disabled={!canSubmit || busy} onClick={submit}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </div>

      <div className="disclaimer">
        {SYNC_ENABLED
          ? 'Your account works across your devices. Next you’ll create or join a crew.'
          : 'Demo mode: your account lives on this device only. Add Supabase to sync across devices.'}
      </div>
    </div>
  )
}
