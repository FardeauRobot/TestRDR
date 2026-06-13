import { useState } from 'react'
import { useStore } from '../store/context'
import { SYNC_ENABLED } from '../lib/supabase'
import { cx } from '../lib/util'

/** Shown before onboarding: create a crew, or join one by name + password. */
export function CrewGate({ invitedName }: { invitedName?: string }) {
  const store = useStore()
  const [mode, setMode] = useState<'join' | 'create'>(invitedName ? 'join' : 'create')
  const [name, setName] = useState(invitedName ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'create') await store.createCrew(name.trim(), password)
      else await store.joinCrew(name.trim(), password)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = name.trim().length >= 2 && password.length >= 4

  return (
    <div className="center-screen">
      <div className="brand-lg">Crew&nbsp;Watch</div>
      <p className="lead">
        A private check-in for your crew. First, create your crew or join an
        existing one — everyone with the same name + password sees each other.
      </p>

      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className={cx('btn', mode === 'create' ? 'primary' : 'ghost')} onClick={() => setMode('create')}>
          Create a crew
        </button>
        <button className={cx('btn', mode === 'join' ? 'primary' : 'ghost')} onClick={() => setMode('join')}>
          Join a crew
        </button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="field" style={{ marginTop: 0 }}>
          <label>Crew name</label>
          <input
            className="input"
            value={name}
            maxLength={40}
            placeholder="e.g. Sunrise Squad"
            autoCapitalize="words"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>{mode === 'create' ? 'Set a crew password' : 'Crew password'}</label>
          <input
            className="input"
            type="password"
            value={password}
            placeholder={mode === 'create' ? 'pick something to share with your crew' : 'the shared password'}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
          />
        </div>

        {error && (
          <div className="banner warn" style={{ marginTop: 14 }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <button className="btn primary lg" style={{ marginTop: 14 }} disabled={!canSubmit || busy} onClick={submit}>
          {busy ? 'Working…' : mode === 'create' ? 'Create crew' : 'Join crew'}
        </button>
      </div>

      <div className="disclaimer">
        {SYNC_ENABLED
          ? 'Anyone with the crew name + password can join, so share them privately. You can invite people with a link after joining.'
          : 'Demo mode: crews aren’t really separated on one device — any name/password works and shows sample mates. Add Supabase to make crews real & cross-device.'}
      </div>
    </div>
  )
}
