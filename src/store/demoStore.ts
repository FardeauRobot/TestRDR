import type { GeoPoint, Member } from '../types'
import { uid } from '../lib/util'
import { BaseStore, type Crew, type NewConsumption, type NewProfile } from './store'

const DATA_KEY = 'crewwatch.demo.v1'
const CREW_KEY = 'crewwatch.crew.v1'
const meKey = (crewId: string) => `crewwatch.me.${crewId}`

/** A scatter point around a default centre (Paris) for seeded demo pins. */
const CENTER = { lat: 48.8566, lng: 2.3522 }
function near(dLat: number, dLng: number, at: number): GeoPoint {
  return { lat: CENTER.lat + dLat, lng: CENTER.lng + dLng, accuracy: 25, at }
}

interface Bucket {
  members: Member[]
  events: { id: string; memberId: string; substanceId: string; dose?: string; note?: string; at: number }[]
}

function seed(): Bucket {
  const now = Date.now()
  const min = 60_000
  return {
    members: [
      { id: 'm-robin', name: 'Robin', emoji: '🦊', color: '#f59e0b', isAdmin: false, mixWarnings: true, lastCheckIn: now - 5 * min, sos: false, location: near(0.001, 0.0012, now - 4 * min), updatedAt: now },
      { id: 'm-sasha', name: 'Sasha', emoji: '🐙', color: '#38bdf8', isAdmin: false, mixWarnings: true, lastCheckIn: now - 60 * min, sos: false, location: near(-0.0014, 0.0009, now - 60 * min), updatedAt: now },
      { id: 'm-max', name: 'Max', emoji: '🐺', color: '#a78bfa', isAdmin: false, mixWarnings: true, lastCheckIn: now - 2 * min, sos: false, location: near(0.0006, -0.0011, now - 2 * min), updatedAt: now },
      { id: 'm-lou', name: 'Lou', emoji: '🦉', color: '#34d399', isAdmin: false, mixWarnings: true, lastCheckIn: now - 8 * min, sos: false, updatedAt: now }
    ],
    events: [
      // Max is mixing depressants (alcohol + ketamine) — triggers the danger flag.
      { id: uid(), memberId: 'm-robin', substanceId: 'mdma', dose: '100mg', at: now - 35 * min },
      { id: uid(), memberId: 'm-sasha', substanceId: 'ketamine', at: now - 58 * min },
      { id: uid(), memberId: 'm-max', substanceId: 'alcohol', dose: '2 beers', at: now - 50 * min },
      { id: uid(), memberId: 'm-max', substanceId: 'ketamine', at: now - 12 * min },
      { id: uid(), memberId: 'm-lou', substanceId: 'cannabis', at: now - 200 * min }
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
  /** True between creating a crew and making the creator's profile (→ admin). */
  private pendingAdmin = false

  constructor() {
    super()
    this.bucket = this.loadBucket()
    const crew = this.loadCrew()
    const meId = crew ? localStorage.getItem(meKey(crew.id)) : null
    this.state = { crew, members: this.bucket.members, events: this.bucket.events, meId, ready: true }
  }

  private loadBucket(): Bucket {
    try {
      const raw = localStorage.getItem(DATA_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        if (p.members?.length) return { members: p.members, events: p.events ?? [] }
      }
    } catch {
      /* ignore */
    }
    const fresh = seed()
    localStorage.setItem(DATA_KEY, JSON.stringify(fresh))
    return fresh
  }

  private loadCrew(): Crew | null {
    try {
      const raw = localStorage.getItem(CREW_KEY)
      return raw ? (JSON.parse(raw) as Crew) : null
    } catch {
      return null
    }
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

  private patchMe(patch: (m: Member) => Member): void {
    const meId = this.state.meId
    if (!meId) return
    this.bucket.members = this.bucket.members.map((m) => (m.id === meId ? patch(m) : m))
    this.persist()
    this.set({ members: this.bucket.members })
  }

  async updateProfile(patch: Partial<NewProfile>): Promise<void> {
    this.patchMe((m) => ({ ...m, ...patch, updatedAt: Date.now() }))
  }

  async logConsumption(input: NewConsumption): Promise<void> {
    const meId = this.state.meId
    if (!meId) return
    const now = Date.now()
    this.bucket.events = [...this.bucket.events, { id: uid(), memberId: meId, at: now, ...input }]
    this.persist()
    this.set({ events: this.bucket.events })
    this.patchMe((m) => ({ ...m, lastCheckIn: now })) // logging counts as a check-in
  }

  async checkIn(): Promise<void> {
    this.patchMe((m) => ({ ...m, lastCheckIn: Date.now(), sos: false }))
  }

  async setSos(on: boolean): Promise<void> {
    this.patchMe((m) => ({ ...m, sos: on, lastCheckIn: Date.now() }))
  }

  async updateLocation(point: GeoPoint | null): Promise<void> {
    this.patchMe((m) => ({ ...m, location: point ?? undefined, updatedAt: Date.now() }))
  }

  async setMixWarnings(on: boolean): Promise<void> {
    this.patchMe((m) => ({ ...m, mixWarnings: on, updatedAt: Date.now() }))
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
