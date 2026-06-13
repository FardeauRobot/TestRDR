import type { ConsumptionEvent, GeoPoint, ID, Member } from '../types'

export interface Crew {
  id: string
  name: string
}

export interface CrewState {
  /** The crew this device is currently in, or null if not joined one yet. */
  crew: Crew | null
  members: Member[]
  events: ConsumptionEvent[]
  /** The id of this device's own profile, or null if not onboarded yet. */
  meId: ID | null
  /** Whether the store has finished its first load. */
  ready: boolean
}

export interface NewProfile {
  name: string
  emoji: string
  color: string
}

export interface NewConsumption {
  substanceId: string
  dose?: string
  note?: string
}

export interface CrewStore {
  readonly mode: 'demo' | 'synced'
  getState(): CrewState
  subscribe(listener: () => void): () => void

  /** Create a brand-new crew and enter it. Throws on duplicate name / bad input. */
  createCrew(name: string, password: string): Promise<void>
  /** Join an existing crew by name + password. Throws if the combo is wrong. */
  joinCrew(name: string, password: string): Promise<void>
  /** Leave the crew on this device (forgets crew + profile here). */
  leaveCrew(): Promise<void>
  /** Admin: permanently delete the whole crew (re-checks the crew password). */
  deleteCrew(password: string): Promise<void>

  /** Create this device's profile (within the current crew) and become `meId`. */
  createProfile(input: NewProfile): Promise<void>
  updateProfile(patch: Partial<NewProfile>): Promise<void>
  logConsumption(input: NewConsumption): Promise<void>
  checkIn(): Promise<void>
  setSos(on: boolean): Promise<void>
  updateLocation(point: GeoPoint | null): Promise<void>
  /** Set this member's current status note (empty string clears it). */
  setStatus(text: string): Promise<void>
  /** Toggle the pre-log risky-combination disclaimer for this member. */
  setMixWarnings(on: boolean): Promise<void>

  // --- Admin only (gated in the UI by the current member's isAdmin) ---
  /** Remove a member (and their logs) from the crew. */
  removeMember(memberId: ID): Promise<void>
  /** Mark another member as safe — clears their SOS and refreshes their check-in. */
  clearMemberSos(memberId: ID): Promise<void>
}

/** Reusable subscription + immutable-snapshot machinery for store impls. */
export abstract class BaseStore implements CrewStore {
  abstract readonly mode: 'demo' | 'synced'
  protected state: CrewState = { crew: null, members: [], events: [], meId: null, ready: false }
  private listeners = new Set<() => void>()

  getState(): CrewState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  protected set(next: Partial<CrewState>): void {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((l) => l())
  }

  protected get me(): Member | undefined {
    return this.state.members.find((m) => m.id === this.state.meId)
  }

  abstract createCrew(name: string, password: string): Promise<void>
  abstract joinCrew(name: string, password: string): Promise<void>
  abstract leaveCrew(): Promise<void>
  abstract deleteCrew(password: string): Promise<void>
  abstract createProfile(input: NewProfile): Promise<void>
  abstract updateProfile(patch: Partial<NewProfile>): Promise<void>
  abstract logConsumption(input: NewConsumption): Promise<void>
  abstract checkIn(): Promise<void>
  abstract setSos(on: boolean): Promise<void>
  abstract updateLocation(point: GeoPoint | null): Promise<void>
  abstract setStatus(text: string): Promise<void>
  abstract setMixWarnings(on: boolean): Promise<void>
  abstract removeMember(memberId: ID): Promise<void>
  abstract clearMemberSos(memberId: ID): Promise<void>
}
