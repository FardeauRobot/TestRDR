export type ID = string

/** A crew member's profile. */
export interface Member {
  id: ID
  name: string
  emoji: string
  color: string
  /** Crew creator / admin: can remove members and clear others' SOS. */
  isAdmin: boolean
  /** Show the "risky combination" disclaimer before logging. Default true. */
  mixWarnings: boolean
  /** Last time this member tapped "I'm OK" (ms epoch). */
  lastCheckIn: number
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
