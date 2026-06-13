/** Small shared helpers: ids, time formatting, classnames. */

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const MIN = 60_000
const HOUR = 60 * MIN

/** "1h 04m", "12m 30s", "8s" — compact elapsed time since `from`. */
export function formatElapsed(fromMs: number, nowMs: number): string {
  const ms = Math.max(0, nowMs - fromMs)
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** "just now", "5 min ago", "2 h ago" — human relative time. */
export function formatAgo(fromMs: number, nowMs: number): string {
  const ms = Math.max(0, nowMs - fromMs)
  if (ms < 45_000) return 'just now'
  if (ms < HOUR) return `${Math.round(ms / MIN)} min ago`
  if (ms < 24 * HOUR) return `${Math.round(ms / HOUR)} h ago`
  return `${Math.round(ms / (24 * HOUR))} d ago`
}

export function minutesSince(fromMs: number, nowMs: number): number {
  return (nowMs - fromMs) / MIN
}
