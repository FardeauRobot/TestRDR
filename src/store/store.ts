import type { Account, CheckOutcome, CheckRequest, ConsumptionEvent, GeoPoint, ID, MapPin, Member } from '../types'

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
  /** Pending + recently-resolved "You good?" check-in requests in this crew. */
  checkRequests: CheckRequest[]
  /** Custom markers the crew has dropped on the map (campsite, meeting point, etc). */
  pins: MapPin[]
  /** The id of this device's own profile in the current crew, or null. */
  meId: ID | null
  /** This crew's location-retention override in minutes; null = inherit the
   *  global default, 0 = never auto-wipe. (See setLocationRetention.) */
  locationRetentionMins: number | null
  /** The app-wide default location-retention window in minutes (0 = off). */
  globalRetentionMins: number | null
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

export interface NewPin {
  label: string
  emoji: string
  lat: number
  lng: number
}

/** A browser Web Push subscription, flattened for storage. */
export interface PushSubData {
  endpoint: string
  p256dh: string
  auth: string
}

/** A crew as seen by an operator in the cross-crew console (rollup, no secrets). */
export interface CrewSummary {
  id: string
  name: string
  createdAt: number
  memberCount: number
  eventCount: number
  lastActivity: number
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
  /** Admin: log the same consumption for a batch of other members at once
   *  (e.g. a whole group that just took the same thing together). */
  logConsumptionFor(memberIds: ID[], input: NewConsumption): Promise<void>
  setSos(on: boolean): Promise<void>
  /** Send a "You good?" check-in request to another member (also pushes to them). */
  requestCheck(toId: ID): Promise<void>
  /** Answer a check-in request aimed at me. `help` also raises my SOS. */
  resolveCheck(requestId: ID, outcome: CheckOutcome): Promise<void>
  updateLocation(point: GeoPoint | null): Promise<void>
  /** Set this member's current status note (empty string clears it). */
  setStatus(text: string): Promise<void>
  /** Toggle the pre-log risky-combination disclaimer for this member. */
  setMixWarnings(on: boolean): Promise<void>

  /** Drop a custom marker on the map (campsite, meeting point, etc). */
  addPin(input: NewPin): Promise<void>
  /** Remove a map pin (the member who dropped it, or an admin). */
  removePin(pinId: ID): Promise<void>

  /** Persist this device's Web Push subscription so crewmates' alerts (SOS) can
   *  reach it. No-op in demo mode (no backend to push from). */
  savePushSubscription(sub: PushSubData): Promise<void>
  /** Forget a device push subscription by its endpoint (e.g. on opt-out). */
  removePushSubscription(endpoint: string): Promise<void>

  // --- Admin only (gated in the UI by the current member's isAdmin) ---
  /** Remove a member (and their logs) from the crew. */
  removeMember(memberId: ID): Promise<void>
  /** Mark another member as safe — clears their SOS and refreshes their check-in. */
  clearMemberSos(memberId: ID): Promise<void>
  /** Promote a member to admin, or demote them back to a regular member. */
  setAdmin(memberId: ID, on: boolean): Promise<void>
  /** Immediately forget every member's location in this crew (a "panic wipe"). */
  wipeLocations(): Promise<void>
  /** Set this crew's location-retention window in minutes (0 = never auto-wipe,
   *  null = inherit the app-wide default). */
  setLocationRetention(mins: number | null): Promise<void>

  // --- Operator only (cross-crew; gated by the signed-in account's isOperator) ---
  /** List every crew in the app with rollup counts. Operator accounts only. */
  listAllCrews(): Promise<CrewSummary[]>
  /** Permanently delete any crew by id (cascades to its profiles + logs). */
  deleteCrewById(crewId: string): Promise<void>
  /** Set the app-wide default location-retention window in minutes (0 = off). */
  setGlobalRetention(mins: number): Promise<void>
}

/** Reusable subscription + immutable-snapshot machinery for store impls. */
export abstract class BaseStore implements CrewStore {
  abstract readonly mode: 'demo' | 'synced'
  protected state: CrewState = { account: null, crew: null, members: [], events: [], checkRequests: [], pins: [], meId: null, locationRetentionMins: null, globalRetentionMins: null, ready: false }
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
  abstract logConsumptionFor(memberIds: ID[], input: NewConsumption): Promise<void>
  abstract setSos(on: boolean): Promise<void>
  abstract requestCheck(toId: ID): Promise<void>
  abstract resolveCheck(requestId: ID, outcome: CheckOutcome): Promise<void>
  abstract updateLocation(point: GeoPoint | null): Promise<void>
  abstract setStatus(text: string): Promise<void>
  abstract setMixWarnings(on: boolean): Promise<void>
  abstract addPin(input: NewPin): Promise<void>
  abstract removePin(pinId: ID): Promise<void>
  abstract savePushSubscription(sub: PushSubData): Promise<void>
  abstract removePushSubscription(endpoint: string): Promise<void>
  abstract removeMember(memberId: ID): Promise<void>
  abstract clearMemberSos(memberId: ID): Promise<void>
  abstract setAdmin(memberId: ID, on: boolean): Promise<void>
  abstract wipeLocations(): Promise<void>
  abstract setLocationRetention(mins: number | null): Promise<void>
  abstract listAllCrews(): Promise<CrewSummary[]>
  abstract deleteCrewById(crewId: string): Promise<void>
  abstract setGlobalRetention(mins: number): Promise<void>
}
