import type { ConsumptionEvent, GeoPoint, Member } from '../types'
import { MIN, uid } from '../lib/util'
import { BaseStore, type Crew, type NewConsumption, type NewProfile } from './store'
import { CREW_KEY, loadCrew, meKey } from './persist'

const DATA_KEY = 'crewwatch.demo.v2'

/** A scatter point around a default centre (Paris) for seeded demo pins. */
const CENTER = { lat: 48.8566, lng: 2.3522 }
function near(dLat: number, dLng: number, at: number): GeoPoint {
  return { lat: CENTER.lat + dLat, lng: CENTER.lng + dLng, accuracy: 25, at }
}

interface Bucket {
  members: Member[]
  events: ConsumptionEvent[]
}

function seed(): Bucket {
  const now = Date.now()
  return {
    members: [
      { id: 'm-robin', name: 'Robin', emoji: '🦊', color: '#f59e0b', isAdmin: false, mixWarnings: true, lastCheckIn: now - 5 * MIN, status: 'At the main stage 🎶', statusAt: now - 5 * MIN, sos: false, location: near(0.001, 0.0012, now - 4 * MIN), updatedAt: now },
      { id: 'm-sasha', name: 'Sasha', emoji: '🐙', color: '#38bdf8', isAdmin: false, mixWarnings: true, lastCheckIn: now - 60 * MIN, status: 'Resting in the shade', statusAt: now - 40 * MIN, sos: false, location: near(-0.0014, 0.0009, now - 60 * MIN), updatedAt: now },
      { id: 'm-max', name: 'Max', emoji: '🐺', color: '#a78bfa', isAdmin: false, mixWarnings: true, lastCheckIn: now - 2 * MIN, sos: false, location: near(0.0006, -0.0011, now - 2 * MIN), updatedAt: now },
      { id: 'm-lou', name: 'Lou', emoji: '🦉', color: '#34d399', isAdmin: false, mixWarnings: true, lastCheckIn: now - 8 * MIN, sos: false, updatedAt: now }
    ],
    events: [
      // Max is mixing depressants (alcohol + ketamine) — triggers the danger flag.
      { id: uid(), memberId: 'm-robin', substanceId: 'mdma', dose: '100mg', at: now - 35 * MIN },
      { id: uid(), memberId: 'm-sasha', substanceId: 'ketamine', at: now - 58 * MIN },
      { id: uid(), memberId: 'm-max', substanceId: 'alcohol', dose: '2 beers', at: now - 50 * MIN },
      { id: uid(), memberId: 'm-max', substanceId: 'ketamine', at: now - 12 * MIN },
      { id: uid(), memberId: 'm-lou', substanceId: 'cannabis', at: now - 200 * MIN }
    ]
  }
}

function slug(name: string): string {
  return 'demo-' + name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/** Single-device store backed by localStorage. Crews aren't truly separated
 *  here (no backend) — every demo crew shows the same sample mates so you can
 *  preview the flow. Add Supabase to make crews real and cross-device. */
export class DemoStore extends BaseStore {
  readonly mode = 'demo' as const
  private bucket: Bucket

  constructor() {
    super()
    this.bucket = this.loadBucket()
    const crew = loadCrew()
    const storedMe = crew ? localStorage.getItem(meKey(crew.id)) : null
    // Guard against a stale profile id (e.g. after a storage-version bump).
    const meId = storedMe && this.bucket.members.some((m) => m.id === storedMe) ? storedMe : null
    this.state = { crew, members: this.bucket.members, events: this.bucket.events, meId, ready: true }
  }

  private loadBucket(): Bucket {
    try {
      const raw = localStorage.getItem(DATA_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        return { members: p.members ?? [], events: p.events ?? [] }
      }
    } catch {
      /* ignore */
    }
    // Sample crew only in local dev (`npm run dev`); deployed builds start empty.
    const fresh = import.meta.env.DEV ? seed() : { members: [], events: [] }
    localStorage.setItem(DATA_KEY, JSON.stringify(fresh))
    return fresh
  }

  private persist(): void {
    localStorage.setItem(DATA_KEY, JSON.stringify(this.bucket))
  }

  private enterCrew(name: string): void {
    const crew: Crew = { id: slug(name), name: name.trim() }
    localStorage.setItem(CREW_KEY, JSON.stringify(crew))
    const meId = localStorage.getItem(meKey(crew.id))
    this.set({ crew, meId })
  }

  async createCrew(name: string, password: string): Promise<void> {
    if (name.trim().length < 2) throw new Error('Crew name must be at least 2 characters')
    if (password.length < 4) throw new Error('Password must be at least 4 characters')
    this.pendingAdmin = true // the creator becomes admin on their next profile
    this.enterCrew(name)
  }

  async joinCrew(name: string, _password: string): Promise<void> {
    if (name.trim().length < 2) throw new Error('Enter a crew name')
    this.pendingAdmin = false
    this.enterCrew(name) // demo: any name/password works
  }

  async leaveCrew(): Promise<void> {
    localStorage.removeItem(CREW_KEY)
    this.set({ crew: null, meId: null })
  }

  async deleteCrew(_password: string): Promise<void> {
    this.bucket = { members: [], events: [] }
    this.persist()
    localStorage.removeItem(CREW_KEY)
    this.set({ crew: null, meId: null, members: [], events: [] })
  }

  async createProfile(input: NewProfile): Promise<void> {
    const crew = this.state.crew
    if (!crew) return
    const now = Date.now()
    const id = uid()
    const member: Member = { id, ...input, isAdmin: this.pendingAdmin, mixWarnings: true, lastCheckIn: now, sos: false, updatedAt: now }
    this.pendingAdmin = false
    this.bucket.members = [...this.bucket.members, member]
    this.persist()
    localStorage.setItem(meKey(crew.id), id)
    this.set({ members: this.bucket.members, meId: id })
  }

  /** Merge a partial patch into this device's own member (camelCase domain shape). */
  private patchMe(patch: Partial<Member>): void {
    const meId = this.state.meId
    if (!meId) return
    this.bucket.members = this.bucket.members.map((m) => (m.id === meId ? { ...m, ...patch, updatedAt: Date.now() } : m))
    this.persist()
    this.set({ members: this.bucket.members })
  }

  async updateProfile(patch: Partial<NewProfile>): Promise<void> {
    this.patchMe(patch)
  }

  async logConsumption(input: NewConsumption): Promise<void> {
    const meId = this.state.meId
    if (!meId) return
    const now = Date.now()
    this.bucket.events = [...this.bucket.events, { id: uid(), memberId: meId, at: now, ...input }]
    this.persist()
    this.set({ events: this.bucket.events })
    this.patchMe({ lastCheckIn: now }) // logging counts as a check-in
  }

  async checkIn(): Promise<void> {
    this.patchMe({ lastCheckIn: Date.now(), sos: false })
  }

  async setSos(on: boolean): Promise<void> {
    this.patchMe({ sos: on, lastCheckIn: Date.now() })
  }

  async updateLocation(point: GeoPoint | null): Promise<void> {
    this.patchMe({ location: point ?? undefined })
  }

  async setStatus(text: string): Promise<void> {
    const now = Date.now()
    const t = text.trim()
    this.patchMe({ status: t || undefined, statusAt: t ? now : undefined, lastCheckIn: now })
  }

  async setMixWarnings(on: boolean): Promise<void> {
    this.patchMe({ mixWarnings: on })
  }

  async removeMember(memberId: string): Promise<void> {
    this.bucket.members = this.bucket.members.filter((m) => m.id !== memberId)
    this.bucket.events = this.bucket.events.filter((e) => e.memberId !== memberId)
    this.persist()
    this.set({ members: this.bucket.members, events: this.bucket.events })
  }

  async clearMemberSos(memberId: string): Promise<void> {
    const now = Date.now()
    this.bucket.members = this.bucket.members.map((m) =>
      m.id === memberId ? { ...m, sos: false, lastCheckIn: now } : m
    )
    this.persist()
    this.set({ members: this.bucket.members })
  }
}
