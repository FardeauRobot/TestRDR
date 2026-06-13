import { useState } from 'react'
import { useStore } from '../store/context'

const PRESETS = [
  '🎶 At the stage',
  '🏕️ Back at camp',
  '🚶 On the move',
  '💧 Hydrating',
  '🍔 Getting food',
  '🚻 Toilet break',
  '😵‍💫 Need a breather',
  '💚 All good'
]

/** Lets the current member broadcast a short status / whereabouts to the crew. */
export function StatusEditor() {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function send(value: string) {
    const t = value.trim()
    if (!t) return
    void store.setStatus(t)
    setText('')
    setOpen(false)
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn ghost" onClick={() => setOpen((v) => !v)}>
        📣 {open ? 'Close' : 'Share a status'}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="chip-row">
            {PRESETS.map((p) => (
              <button key={p} className="status-chip" onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              className="input"
              value={text}
              maxLength={80}
              placeholder="…or write your own"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(text)}
            />
            <button className="btn primary" style={{ width: 'auto', flex: '0 0 auto' }} disabled={!text.trim()} onClick={() => send(text)}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
