/** localStorage keys + helpers shared by both store implementations. */
import type { Crew } from './store'

/** The crew this device is currently in. */
export const CREW_KEY = 'crewwatch.crew.v1'
/** This device's own profile id, namespaced per crew. */
export const meKey = (crewId: string) => `crewwatch.me.${crewId}`

export function loadCrew(): Crew | null {
  try {
    const raw = localStorage.getItem(CREW_KEY)
    return raw ? (JSON.parse(raw) as Crew) : null
  } catch {
    return null
  }
}
