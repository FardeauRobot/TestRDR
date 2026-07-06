/** localStorage keys + helpers shared by both store implementations. */
import type { Account } from '../types'
import type { Crew } from './store'

/** The crew this device is currently in. */
export const CREW_KEY = 'crewwatch.crew.v1'
/** The logged-in account on this device (public fields only — never the password). */
export const ACCOUNT_KEY = 'crewwatch.account.v1'
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

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    return raw ? (JSON.parse(raw) as Account) : null
  } catch {
    return null
  }
}

export function saveAccount(account: Account | null): void {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  else localStorage.removeItem(ACCOUNT_KEY)
}
