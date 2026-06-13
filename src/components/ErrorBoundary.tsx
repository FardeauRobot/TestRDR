import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches render/runtime errors so the app shows a message instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surfaced in the device console for debugging.
    console.error('Crew Watch crashed:', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="app">
        <div className="center-screen">
          <div className="brand-lg">Something went wrong</div>
          <p className="lead">
            The app hit an unexpected error. Reloading usually fixes it. If it keeps happening,
            “Reset app data” clears this device's local data (you'll re-join your crew).
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              fontSize: 12,
              color: 'var(--muted)',
              maxHeight: 180,
              overflow: 'auto'
            }}
          >
            {error.message || String(error)}
          </pre>
          <button className="btn primary lg" style={{ marginTop: 14 }} onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 10, color: 'var(--sos)' }}
            onClick={() => {
              try {
                localStorage.clear()
              } finally {
                location.reload()
              }
            }}
          >
            Reset app data
          </button>
        </div>
      </div>
    )
  }
}
