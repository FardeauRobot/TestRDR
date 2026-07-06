import type { CheckRequest, ConsumptionEvent, Member } from '../types'
import { getSubstance, type Substance } from './substances'
import { interaction, interactionReason, RISK_META, type RiskLevel } from './interactions'
import { minutesSince } from './util'

export type Tone = 'sos' | 'alert' | 'active' | 'ok' | 'idle'

/** Severity order (lowest = most urgent). Drives crew-list sorting; one source
 *  of truth so a new tone is ranked in exactly one place. */
export const TONE_PRIORITY: Record<Tone, number> = { sos: 0, alert: 1, active: 2, ok: 3, idle: 4 }

/** A member's consumption events, newest first. */
export function eventsFor(memberId: string, events: ConsumptionEvent[]): ConsumptionEvent[] {
  return events.filter((e) => e.memberId === memberId).sort((a, b) => b.at - a.at)
}

export interface MemberStatus {
  tone: Tone
  /** Short headline, e.g. "Peaking", "Quiet 50 min". */
  label: string
  /** The most recent consumption, if any. */
  lastEvent?: ConsumptionEvent
  /** True while any substance is estimated to still be active. */
  active: boolean
}

/** A per-substance timer: when this member last took this product, and how often. */
export interface DoseTimer {
  substance: Substance
  lastAt: number
  count: number
  /** Estimated to still be in effect (elapsed < typical duration). */
  active: boolean
}

/** A member is "quiet" if they're active but haven't checked in for a while. */
const QUIET_MIN = 45
const SILENT_MIN = 90

/** One timer per distinct substance this member has logged, newest first. */
export function doseTimers(memberId: string, events: ConsumptionEvent[], now: number): DoseTimer[] {
  const agg = new Map<string, { lastAt: number; count: number }>()
  for (const e of events) {
    if (e.memberId !== memberId) continue
    const cur = agg.get(e.substanceId)
    if (cur) {
      cur.count += 1
      cur.lastAt = Math.max(cur.lastAt, e.at)
    } else {
      agg.set(e.substanceId, { lastAt: e.at, count: 1 })
    }
  }
  return [...agg.entries()]
    .map(([id, v]) => {
      const substance = getSubstance(id)
      return { substance, lastAt: v.lastAt, count: v.count, active: minutesSince(v.lastAt, now) < substance.durationMins }
    })
    .sort((a, b) => b.lastAt - a.lastAt)
}

export function activeDoses(memberId: string, events: ConsumptionEvent[], now: number): DoseTimer[] {
  return doseTimers(memberId, events, now).filter((d) => d.active)
}

export interface MixAlert {
  level: 'danger' | 'info'
  text: string
}

/** The worst interaction among the substances a member currently has active. */
export function mixAlert(active: DoseTimer[]): MixAlert | null {
  if (active.length < 2) return null
  let worst: { a: Substance; b: Substance; level: RiskLevel } | null = null
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i].substance
      const b = active[j].substance
      const level = interaction(a.id, b.id)
      if (!worst || RISK_META[level].severity > RISK_META[worst.level].severity) {
        worst = { a, b, level }
      }
    }
  }
  if (!worst) return null
  const meta = RISK_META[worst.level]
  if (worst.level === 'dangerous' || worst.level === 'unsafe') {
    return { level: 'danger', text: `${meta.label}: ${worst.a.name} + ${worst.b.name}. ${interactionReason(worst.a.id, worst.b.id, worst.level)}` }
  }
  if (worst.level === 'caution') {
    return { level: 'info', text: `Caution: ${worst.a.name} + ${worst.b.name} on board — go slow.` }
  }
  return { level: 'info', text: `Combining ${active.length}: ${active.map((d) => d.substance.name).join(', ')}.` }
}

// --- Known-risky combination warnings, shown before logging -----------------

export interface ComboRisk {
  other: Substance
  level: RiskLevel
  reason: string
}

/** Risky combos (caution or worse) between `substanceId` and active substances. */
export function comboRisks(substanceId: string, active: DoseTimer[]): ComboRisk[] {
  const sel = getSubstance(substanceId)
  const seen = new Set<string>()
  const out: ComboRisk[] = []
  for (const d of active) {
    if (d.substance.id === sel.id || seen.has(d.substance.id)) continue
    const level = interaction(sel.id, d.substance.id)
    if (RISK_META[level].severity >= RISK_META.caution.severity) {
      seen.add(d.substance.id)
      out.push({ other: d.substance, level, reason: interactionReason(sel.id, d.substance.id, level) })
    }
  }
  return out.sort((x, y) => RISK_META[y.level].severity - RISK_META[x.level].severity)
}

export function memberStatus(member: Member, events: ConsumptionEvent[], now: number): MemberStatus {
  const all = doseTimers(member.id, events, now)
  const active = all.filter((d) => d.active)
  const last = all[0]
  const lastEvent = eventsFor(member.id, events)[0]
  const isActive = active.length > 0

  if (member.sos) {
    return { tone: 'sos', label: 'SOS — needs help', lastEvent, active: isActive }
  }

  const mix = mixAlert(active)
  const sinceCheckIn = minutesSince(member.lastCheckIn, now)

  if (isActive && sinceCheckIn > SILENT_MIN) {
    return { tone: 'alert', label: `Silent ${Math.round(sinceCheckIn)} min`, lastEvent, active: true }
  }
  if (mix?.level === 'danger') {
    return { tone: 'alert', label: 'Dangerous mix', lastEvent, active: true }
  }
  if (isActive && sinceCheckIn > QUIET_MIN) {
    return { tone: 'alert', label: `Quiet ${Math.round(sinceCheckIn)} min — check in?`, lastEvent, active: true }
  }
  if (isActive) {
    const sub = last.substance
    const mins = minutesSince(last.lastAt, now)
    const phase = mins < sub.durationMins * 0.4 ? 'Coming up' : 'Active'
    return { tone: 'active', label: phase, lastEvent, active: true }
  }
  if (lastEvent) {
    return { tone: 'ok', label: 'Coming down / clear', lastEvent, active: false }
  }
  return { tone: 'idle', label: 'Nothing logged', active: false }
}

export interface RedoseCheck {
  tooSoon: boolean
  waitedMin: number
  waitMin: number
  lastAt?: number
}

/** Would logging `substanceId` now be an early re-dose for this member? */
export function checkRedose(
  memberId: string,
  substanceId: string,
  events: ConsumptionEvent[],
  now: number
): RedoseCheck {
  const sub = getSubstance(substanceId)
  const waitMin = sub.redoseWaitMins ?? 0
  const lastSame = eventsFor(memberId, events).find((e) => e.substanceId === substanceId)
  if (!lastSame || waitMin <= 0) {
    return { tooSoon: false, waitedMin: Infinity, waitMin }
  }
  const waitedMin = minutesSince(lastSame.at, now)
  return { tooSoon: waitedMin < waitMin, waitedMin, waitMin, lastAt: lastSame.at }
}

// --- "You good?" check-in requests -----------------------------------------

/** How long an unanswered ping waits before the app privately tells the asker. */
export const PING_TIMEOUT_MIN = 5

/** The oldest still-pending "You good?" request aimed at me, if any. This is
 *  what the recipient gets prompted to answer. */
export function incomingCheck(checkRequests: CheckRequest[], meId: string | null): CheckRequest | undefined {
  if (!meId) return undefined
  return checkRequests
    .filter((c) => c.toId === meId && !c.resolvedAt)
    .sort((a, b) => a.at - b.at)[0]
}

/** Pings I sent that are still unanswered, split by whether they've passed the
 *  timeout. Only the asker sees these — an unanswered ping is private, never a
 *  crew-wide alarm. */
export function outgoingChecks(
  checkRequests: CheckRequest[],
  meId: string | null,
  now: number
): { toId: string; at: number; overdue: boolean }[] {
  if (!meId) return []
  return checkRequests
    .filter((c) => c.fromId === meId && !c.resolvedAt)
    .map((c) => ({ toId: c.toId, at: c.at, overdue: minutesSince(c.at, now) >= PING_TIMEOUT_MIN }))
}

/** My still-pending ping to a specific member, if one is in flight. */
export function outgoingCheckTo(
  checkRequests: CheckRequest[],
  meId: string | null,
  toId: string,
  now: number
): { at: number; overdue: boolean } | undefined {
  return outgoingChecks(checkRequests, meId, now).find((c) => c.toId === toId)
}
