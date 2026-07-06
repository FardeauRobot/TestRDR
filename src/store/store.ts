import type { Account, ConsumptionEvent, GeoPoint, ID, Member } from '../types'

export interface Crew {
  id: string
  name: string
}

export interface CrewState {
  /** The logged-in account on this device, or null if signed out. */
  account: Account | null
  /** The crew this device is currently in, or null if not joined one yet. */
  crew: Crew | null
  members: Member[]
  events: ConsumptionEvent[]
  /** The id of this device's own profile in the current crew, or null. */
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

  /** Register a new account (nickname + password + avatar) and sign in. */
  signup(nickname: string, password: string, emoji: string, color: string): Promise<void>
  /** Sign in to an existing account. Throws if the nickname + password is wrong. */
  login(nickname: string, password: string): Promise<void>
  /** Sign out on this device (forgets account + crew here). */
  logout(): Promise<void>
  /** Update the signed-in account's avatar (also updates the current crew profile). */
  updateAccount(patch: { emoji?: string; color?: string }): Promise<void>

  /** Create a brand-new crew and enter it; auto-creates your member from the account. */
  createCrew(name: string, password: string): Promise<void>
  /** Join an existing crew by name + password; auto-creates/reuses your member. */
  joinCrew(name: string, password: string): Promise<void>
  /** Leave the crew on this device (forgets crew + profile here). */
  leaveCrew(): Promise<void>
  /** Admin: permanently delete the whole crew (re-checks the crew password). */
  deleteCrew(password: string): Promise<void>

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
  /** Promote a member to admin, or demote them back to a regular member. */
  setAdmin(memberId: ID, on: boolean): Promise<void>
}

/** Reusable subscription + immutable-snapshot machinery for store impls. */
export abstract class BaseStore implements CrewStore {
  abstract readonly mode: 'demo' | 'synced'
  protected state: CrewState = { account: null, crew: null, members: [], events: [], meId: null, ready: false }
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

  abstract signup(nickname: string, password: string, emoji: string, color: string): Promise<void>
  abstract login(nickname: string, password: string): Promise<void>
  abstract logout(): Promise<void>
  abstract updateAccount(patch: { emoji?: string; color?: string }): Promise<void>
  abstract createCrew(name: string, password: string): Promise<void>
  abstract joinCrew(name: string, password: string): Promise<void>
  abstract leaveCrew(): Promise<void>
  abstract deleteCrew(password: string): Promise<void>
  abstract updateProfile(patch: Partial<NewProfile>): Promise<void>
  abstract logConsumption(input: NewConsumption): Promise<void>
  abstract checkIn(): Promise<void>
  abstract setSos(on: boolean): Promise<void>
  abstract updateLocation(point: GeoPoint | null): Promise<void>
  abstract setStatus(text: string): Promise<void>
  abstract setMixWarnings(on: boolean): Promise<void>
  abstract removeMember(memberId: ID): Promise<void>
  abstract clearMemberSos(memberId: ID): Promise<void>
  abstract setAdmin(memberId: ID, on: boolean): Promise<void>
}
