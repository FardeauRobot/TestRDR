export type ID = string

/** A login-level identity, shared across every crew this person joins.
 *  Password is never held client-side — only these public fields are. */
export interface Account {
  id: ID
  nickname: string
  emoji: string
  color: string
}

/** A crew member's profile. */
export interface Member {
  id: ID
  /** The account this profile belongs to (how a device finds "me" in a crew). */
  accountId?: ID
  name: string
  emoji: string
  color: string
  /** Crew creator / admin: can remove members and clear others' SOS. */
  isAdmin: boolean
  /** Show the "risky combination" disclaimer before logging. Default true. */
  mixWarnings: boolean
  /** Last time this member tapped "I'm OK" (ms epoch). */
  lastCheckIn: number
  /** Current free-text status / whereabouts, e.g. "heading back to camp". */
  status?: string
  /** When the status was set (ms epoch). */
  statusAt?: number
  /** Whether the member is actively broadcasting an SOS. */
  sos: boolean
  /** Last known location, if location sharing is on. */
  location?: GeoPoint
  /** When this profile was last updated (ms epoch). */
  updatedAt: number
}

export interface GeoPoint {
  lat: number
  lng: number
  /** Accuracy in metres, if known. */
  accuracy?: number
  /** When this fix was taken (ms epoch). */
  at: number
}

/** A single consumption log entry. */
export interface ConsumptionEvent {
  id: ID
  memberId: ID
  /** Key into the SUBSTANCES catalogue, or "other". */
  substanceId: string
  /** Free-text override / detail, e.g. brand, "half", a custom substance name. */
  note?: string
  /** Optional dose amount, e.g. "100mg", "1 beer". */
  dose?: string
  /** When it was consumed (ms epoch). */
  at: number
}
