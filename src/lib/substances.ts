/**
 * A small harm-reduction catalogue. Durations and re-dose windows are ROUGH,
 * population-average ballparks meant only to power friendly timers and
 * "maybe wait" nudges — never medical advice and never a safe-dose guarantee.
 * Everyone reacts differently; combinations change everything.
 */

export interface Substance {
  id: string
  name: string
  emoji: string
  category: 'Depressant' | 'Stimulant' | 'Psychedelic' | 'Dissociative' | 'Empathogen' | 'Opioid' | 'Other'
  /** Typical total duration of effects, in minutes (rough average). */
  durationMins: number
  /** Suggested minimum gap before considering a re-dose, in minutes. */
  redoseWaitMins?: number
  /** A short, plain caution shown when logging. */
  caution?: string
}

export const DISCLAIMER =
  'Timers and nudges are rough averages, not medical advice. They never guarantee safety. ' +
  'When unsure, go slow, test your substances, never mix depressants, and look out for each other.'

export const SUBSTANCES: Substance[] = [
  { id: 'alcohol', name: 'Alcohol', emoji: '🍺', category: 'Depressant', durationMins: 180, redoseWaitMins: 45, caution: 'A depressant — risky to mix with GHB, ketamine, opioids or benzos.' },
  { id: 'cannabis', name: 'Cannabis', emoji: '🌿', category: 'Other', durationMins: 150, redoseWaitMins: 30, caution: 'Edibles come on slow (1–2 h) — easy to over-do by redosing too early.' },
  { id: 'mdma', name: 'MDMA', emoji: '💊', category: 'Empathogen', durationMins: 240, redoseWaitMins: 120, caution: 'Stay hydrated (~500 ml/h, not more), take breaks from dancing, watch body heat. Redosing adds side-effects, not magic.' },
  { id: 'ketamine', name: 'Ketamine', emoji: '🌀', category: 'Dissociative', durationMins: 60, redoseWaitMins: 30, caution: 'A depressant — dangerous with alcohol, GHB or opioids. Stay seated, mind your surroundings.' },
  { id: 'cocaine', name: 'Cocaine', emoji: '❄️', category: 'Stimulant', durationMins: 45, redoseWaitMins: 30, caution: 'Short-lived; easy to chain-redose. Mixed with alcohol it forms cocaethylene, harder on the heart.' },
  { id: 'amphetamine', name: 'Speed / Amphetamine', emoji: '⚡', category: 'Stimulant', durationMins: 300, redoseWaitMins: 120, caution: 'Long-lasting — eat, hydrate and plan sleep. Redosing mostly extends the comedown.' },
  { id: 'mdma_2cb', name: '2C-B', emoji: '🦋', category: 'Psychedelic', durationMins: 300, redoseWaitMins: 180, caution: 'Dose is small and sensitive — wait it out fully before considering more.' },
  { id: 'lsd', name: 'LSD', emoji: '🔮', category: 'Psychedelic', durationMins: 600, redoseWaitMins: 240, caution: 'Long (8–12 h). Set & setting matter; a calm sober buddy helps.' },
  { id: 'psilocybin', name: 'Psilocybin (mushrooms)', emoji: '🍄', category: 'Psychedelic', durationMins: 360, redoseWaitMins: 180, caution: 'Comes up over ~45 min — wait before topping up.' },
  { id: 'ghb', name: 'GHB / GBL', emoji: '⚠️', category: 'Depressant', durationMins: 120, redoseWaitMins: 150, caution: 'NARROW margin between a dose and too much. Never redose early, never mix with alcohol or other depressants. Time every dose.' },
  { id: 'nitrous', name: 'Nitrous (balloons)', emoji: '🎈', category: 'Other', durationMins: 5, redoseWaitMins: 10, caution: 'Sit down before inhaling. Space them out — frequent use depletes B12.' },
  { id: 'caffeine', name: 'Caffeine', emoji: '☕', category: 'Stimulant', durationMins: 240, redoseWaitMins: 90 },
  { id: 'nicotine', name: 'Nicotine', emoji: '🚬', category: 'Stimulant', durationMins: 40, redoseWaitMins: 20 },
  { id: 'opioid', name: 'Opioid', emoji: '🟤', category: 'Opioid', durationMins: 240, redoseWaitMins: 180, caution: 'Highest overdose risk, especially mixed with alcohol/benzos. Keep naloxone nearby; never use alone.' },
  { id: 'benzo', name: 'Benzodiazepine', emoji: '😴', category: 'Depressant', durationMins: 360, redoseWaitMins: 240, caution: 'A depressant — wipes memory of how much you took. Dangerous with alcohol or opioids.' },
  { id: 'other', name: 'Other', emoji: '➕', category: 'Other', durationMins: 120, redoseWaitMins: 60 }
]

export const SUBSTANCE_BY_ID: Record<string, Substance> = Object.fromEntries(
  SUBSTANCES.map((s) => [s.id, s])
)

export function getSubstance(id: string): Substance {
  return SUBSTANCE_BY_ID[id] ?? SUBSTANCE_BY_ID['other']
}
