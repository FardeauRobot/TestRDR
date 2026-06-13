/**
 * Drug interaction chart, transcribed from the TripSit combinations dataset
 * (github.com/TripSit/drugs, combos.json — community-maintained, CC-BY-NC-SA).
 * Ratings are general guidance, not a guarantee of safety. Doses, individual
 * physiology and timing all matter.
 */
import { SUBSTANCES, getSubstance, type Substance } from './substances'

export type RiskLevel = 'dangerous' | 'unsafe' | 'caution' | 'synergy' | 'neutral' | 'decrease' | 'unknown'

export interface RiskMeta {
  label: string
  short: string
  color: string
  /** Require an explicit acknowledgement before logging on top of this. */
  gate: boolean
  /** Higher = show first / more severe. */
  severity: number
  blurb: string
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
  dangerous: { label: 'Dangerous', short: 'Dangerous', color: '#ef4444', gate: true, severity: 6, blurb: 'Never combine — reactions are highly unpredictable with a real risk of serious harm or death.' },
  unsafe: { label: 'Unsafe', short: 'Unsafe', color: '#f97316', gate: true, severity: 5, blurb: 'Considerable risk. Avoid if you can; if not, use much lower doses and keep a sober sitter.' },
  caution: { label: 'Caution', short: 'Caution', color: '#f59e0b', gate: false, severity: 4, blurb: 'Can be unpredictable or unpleasant. Lower your doses and take it slow.' },
  synergy: { label: 'Low risk & synergy', short: 'Synergy', color: '#34d399', gate: false, severity: 3, blurb: 'Generally safe, and the effects amplify each other — go easier on doses.' },
  neutral: { label: 'Low risk, no synergy', short: 'Low risk', color: '#22c55e', gate: false, severity: 2, blurb: 'Generally safe together; the effects are roughly independent.' },
  decrease: { label: 'Low risk, decreased', short: 'Decrease', color: '#60a5fa', gate: false, severity: 1, blurb: 'Generally safe; one may dampen the other — don’t chase it by re-dosing.' },
  unknown: { label: 'No data', short: 'No data', color: '#6b7280', gate: false, severity: 0, blurb: 'No reliable interaction data — research it first and be cautious.' }
}

/** Map our substance ids → TripSit chart keys (only those with data). */
const KEY: Record<string, string> = {
  alcohol: 'alcohol',
  cannabis: 'cannabis',
  mdma: 'mdma',
  ketamine: 'ketamine',
  cocaine: 'cocaine',
  amphetamine: 'amphetamines',
  mdma_2cb: '2c-x',
  lsd: 'lsd',
  psilocybin: 'mushrooms',
  ghb: 'ghb',
  nitrous: 'nitrous',
  caffeine: 'caffeine',
  opioid: 'opioids',
  benzo: 'benzodiazepines'
  // nicotine, other → no chart data
}

type Row = Partial<Record<string, RiskLevel>>

const MATRIX: Record<string, Row> = {
  alcohol: { cannabis: 'synergy', mdma: 'caution', ketamine: 'dangerous', cocaine: 'unsafe', amphetamines: 'caution', '2c-x': 'decrease', lsd: 'decrease', mushrooms: 'decrease', ghb: 'dangerous', nitrous: 'caution', caffeine: 'neutral', opioids: 'dangerous', benzodiazepines: 'dangerous' },
  cannabis: { alcohol: 'synergy', mdma: 'synergy', ketamine: 'synergy', cocaine: 'caution', amphetamines: 'caution', '2c-x': 'caution', lsd: 'caution', mushrooms: 'caution', ghb: 'synergy', nitrous: 'synergy', caffeine: 'neutral', opioids: 'synergy', benzodiazepines: 'decrease' },
  mdma: { alcohol: 'caution', cannabis: 'synergy', ketamine: 'synergy', cocaine: 'caution', amphetamines: 'caution', '2c-x': 'synergy', lsd: 'synergy', mushrooms: 'synergy', ghb: 'synergy', nitrous: 'synergy', caffeine: 'caution', opioids: 'synergy', benzodiazepines: 'decrease' },
  ketamine: { alcohol: 'dangerous', cannabis: 'synergy', mdma: 'synergy', cocaine: 'caution', amphetamines: 'caution', '2c-x': 'synergy', lsd: 'synergy', mushrooms: 'synergy', ghb: 'dangerous', nitrous: 'synergy', caffeine: 'neutral', opioids: 'synergy', benzodiazepines: 'caution' },
  cocaine: { alcohol: 'unsafe', cannabis: 'caution', mdma: 'caution', ketamine: 'caution', amphetamines: 'caution', '2c-x': 'caution', lsd: 'caution', mushrooms: 'caution', ghb: 'caution', nitrous: 'synergy', caffeine: 'caution', opioids: 'dangerous', benzodiazepines: 'decrease' },
  amphetamines: { alcohol: 'caution', cannabis: 'caution', mdma: 'caution', ketamine: 'caution', cocaine: 'caution', '2c-x': 'caution', lsd: 'caution', mushrooms: 'caution', ghb: 'caution', nitrous: 'synergy', caffeine: 'caution', opioids: 'caution', benzodiazepines: 'decrease' },
  '2c-x': { alcohol: 'decrease', cannabis: 'caution', mdma: 'synergy', ketamine: 'synergy', cocaine: 'caution', amphetamines: 'caution', lsd: 'synergy', mushrooms: 'synergy', ghb: 'decrease', nitrous: 'synergy', caffeine: 'neutral', opioids: 'neutral', benzodiazepines: 'decrease' },
  lsd: { alcohol: 'decrease', cannabis: 'caution', mdma: 'synergy', ketamine: 'synergy', cocaine: 'caution', amphetamines: 'caution', '2c-x': 'synergy', mushrooms: 'synergy', ghb: 'decrease', nitrous: 'synergy', caffeine: 'neutral', opioids: 'synergy', benzodiazepines: 'decrease' },
  mushrooms: { alcohol: 'decrease', cannabis: 'caution', mdma: 'synergy', ketamine: 'synergy', cocaine: 'caution', amphetamines: 'caution', '2c-x': 'synergy', lsd: 'synergy', ghb: 'decrease', nitrous: 'synergy', caffeine: 'neutral', opioids: 'synergy', benzodiazepines: 'decrease' },
  ghb: { alcohol: 'dangerous', cannabis: 'synergy', mdma: 'synergy', ketamine: 'dangerous', cocaine: 'caution', amphetamines: 'caution', '2c-x': 'decrease', lsd: 'decrease', mushrooms: 'decrease', nitrous: 'synergy', caffeine: 'neutral', opioids: 'dangerous', benzodiazepines: 'dangerous' },
  nitrous: { alcohol: 'caution', cannabis: 'synergy', mdma: 'synergy', ketamine: 'synergy', cocaine: 'synergy', amphetamines: 'synergy', '2c-x': 'synergy', lsd: 'synergy', mushrooms: 'synergy', ghb: 'synergy', caffeine: 'neutral', opioids: 'synergy', benzodiazepines: 'decrease' },
  caffeine: { alcohol: 'neutral', cannabis: 'neutral', mdma: 'caution', ketamine: 'neutral', cocaine: 'caution', amphetamines: 'caution', '2c-x': 'neutral', lsd: 'neutral', mushrooms: 'neutral', ghb: 'neutral', nitrous: 'neutral', opioids: 'neutral', benzodiazepines: 'decrease' },
  opioids: { alcohol: 'dangerous', cannabis: 'synergy', mdma: 'synergy', ketamine: 'synergy', cocaine: 'dangerous', amphetamines: 'caution', '2c-x': 'neutral', lsd: 'synergy', mushrooms: 'synergy', ghb: 'dangerous', nitrous: 'synergy', caffeine: 'neutral', benzodiazepines: 'dangerous' },
  benzodiazepines: { alcohol: 'dangerous', cannabis: 'decrease', mdma: 'decrease', ketamine: 'caution', cocaine: 'decrease', amphetamines: 'decrease', '2c-x': 'decrease', lsd: 'decrease', mushrooms: 'decrease', ghb: 'dangerous', nitrous: 'decrease', caffeine: 'decrease', opioids: 'dangerous' }
}

/** Extra, combo-specific cautions for the highest-stakes pairs (keyed sorted). */
const NOTES: Record<string, string> = {
  'alcohol|opioids': 'Both suppress breathing — a leading cause of fatal overdose. Tiny amounts, never alone, keep naloxone close.',
  'benzodiazepines|opioids': 'One of the deadliest combos: stacked respiratory depression and blacked-out re-dosing. Avoid — if not, minimal doses, naloxone nearby.',
  'alcohol|benzodiazepines': 'Two sedatives that wipe memory and slow breathing — easy to redose without realising. High overdose risk.',
  'alcohol|ghb': 'Both strong depressants — together they can stop breathing. Never combine.',
  'ghb|benzodiazepines': 'Stacked sedation that can suppress breathing. Never combine.',
  'ghb|opioids': 'Stacked respiratory depression — very high overdose risk. Never combine.',
  'ghb|ketamine': 'Both sedating/dissociating — risk of going under, vomiting and choking. Never combine.',
  'alcohol|ketamine': 'Both sedating — high risk of vomiting while too out of it to protect your airway.',
  'alcohol|cocaine': 'Forms cocaethylene (extra heart strain), and the coke hides how drunk you are.',
  'cocaine|opioids': 'A “speedball” — the stimulant masks the opioid until it fades and breathing can crash.'
}

const SUB_KEY = (substanceId: string): string | undefined => KEY[substanceId]

function pairNote(aKey: string, bKey: string): string | undefined {
  return NOTES[[aKey, bKey].sort().join('|')]
}

/** The interaction level between two of our substances (order-independent). */
export function interaction(aSubId: string, bSubId: string): RiskLevel {
  const a = SUB_KEY(aSubId)
  const b = SUB_KEY(bSubId)
  if (!a || !b) return 'unknown'
  if (a === b) return 'neutral'
  return MATRIX[a]?.[b] ?? MATRIX[b]?.[a] ?? 'unknown'
}

/** A human explanation: a combo-specific note if we have one, else the level blurb. */
export function interactionReason(aSubId: string, bSubId: string, level: RiskLevel): string {
  const a = SUB_KEY(aSubId)
  const b = SUB_KEY(bSubId)
  if (a && b) {
    const note = pairNote(a, b)
    if (note) return note
  }
  return RISK_META[level].blurb
}

/** Substances (ours) that have interaction data, for the reference chart. */
export const CHARTED: Substance[] = SUBSTANCES.filter((s) => KEY[s.id])

/** All interactions for one substance against every other charted substance. */
export interface ChartEntry {
  other: Substance
  level: RiskLevel
}
export function chartFor(substanceId: string): ChartEntry[] {
  return CHARTED.filter((s) => s.id !== substanceId)
    .map((s) => ({ other: s, level: interaction(substanceId, s.id) }))
    .sort((x, y) => RISK_META[y.level].severity - RISK_META[x.level].severity)
}

export { getSubstance }
