import type { Account, ConsumptionEvent, GeoPoint, Member } from '../types'
import { MIN, uid } from '../lib/util'
import { BaseStore, type Crew, type NewConsumption, type NewProfile } from './store'
import { CREW_KEY, loadAccount, loadCrew, meKey, saveAccount } from './persist'

const DATA_KEY = 'crewwatch.demo.v2'
const ACCOUNTS_KEY = 'crewwatch.accounts.v1'

/** A scatter point around a default centre (Paris) for seeded demo pins. */
const CENTER = { lat: 48.8566, lng: 2.3522 }
function near(dLat: number, dLng: number, at: number): GeoPoint {
  return { lat: CENTER.lat + dLat, lng: CENTER.lng + dLng, accuracy: 25, at }
}

interface Bucket {
  members: Member[]
  events: ConsumptionEvent[]
}

/** Demo accounts keep the password in localStorage — acceptable because demo mode
 *  is single-device and never leaves the browser. Synced mode hashes it server-side. */
interface DemoAccount extends Account {
  password: string
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
  private accounts: DemoAccount[]

  constructor() {
    super()
    this.bucket = this.loadBucket()
    this.accounts = this.loadAccounts()
    const account = loadAccount()
    const crew = account ? loadCrew() : null
    this.state = { account, crew, members: this.bucket.members, events: this.bucket.events, meId: null, ready: true }
    // Signed in and previously in a crew → make sure our member exists and land in.
    if (account && crew) this.ensureProfile(crew, false)
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

  private loadAccounts(): DemoAccount[] {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY)
      if (raw) return JSON.parse(raw) as DemoAccount[]
    } catch {
      /* ignore */
    }
    return []
  }

  private persist(): void {
    localStorage.setItem(DATA_KEY, JSON.stringify(this.bucket))
  }

  private persistAccounts(): void {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(this.accounts))
  }

  private publicAccount(a: DemoAccount): Account {
    return { id: a.id, nickname: a.nickname, emoji: a.emoji, color: a.color }
  }

  async signup(nickname: string, password: string, emoji: string, color: string): Promise<void> {
    const nick = nickname.trim()
    if (nick.length < 2) throw new Error('Nickname must be at least 2 characters')
    if (password.length < 4) throw new Error('Password must be at least 4 characters')
    if (this.accounts.some((a) => a.nickname.toLowerCase() === nick.toLowerCase())) {
      throw new Error('That nickname is taken — pick another')
    }
    const acc: DemoAccount = { id: uid(), nickname: nick, password, emoji, color }
    this.accounts = [...this.accounts, acc]
    this.persistAccounts()
    const account = this.publicAccount(acc)
    saveAccount(account)
    this.set({ account })
  }

  async login(nickname: string, password: string): Promise<void> {
    const acc = this.accounts.find(
      (a) => a.nickname.toLowerCase() === nickname.trim().toLowerCase() && a.password === password
    )
    if (!acc) throw new Error('Wrong nickname or password')
    const account = this.publicAccount(acc)
    saveAccount(account)
    this.set({ account })
  }

  async logout(): Promise<void> {
    saveAccount(null)
    localStorage.removeItem(CREW_KEY)
    this.set({ account: null, crew: null, meId: null })
  }

  async updateAccount(patch: { emoji?: string; color?: string }): Promise<void> {
    const account = this.state.account
    if (!account) return
    this.accounts = this.accounts.map((a) => (a.id === account.id ? { ...a, ...patch } : a))
    this.persistAccounts()
    const next = { ...account, ...patch }
    saveAccount(next)
    this.set({ account: next })
    this.patchMe(patch) // keep the current crew profile in step
  }

  private enterCrew(name: string): Crew {
    const crew: Crew = { id: slug(name), name: name.trim() }
    localStorage.setItem(CREW_KEY, JSON.stringify(crew))
    return crew
  }

  /** Find this account's member in the (shared demo) bucket, or create it. */
  private ensureProfile(crew: Crew, asAdmin: boolean): void {
    const account = this.state.account
    if (!account) return
    let mine = this.bucket.members.find((m) => m.accountId === account.id)
    if (!mine) {
      const now = Date.now()
      mine = {
        id: uid(), accountId: account.id, name: account.nickname, emoji: account.emoji, color: account.color,
        isAdmin: asAdmin, mixWarnings: true, lastCheckIn: now, sos: false, updatedAt: now
      }
      this.bucket.members = [...this.bucket.members, mine]
      this.persist()
    }
    localStorage.setItem(meKey(crew.id), mine.id)
    this.set({ crew, members: this.bucket.members, meId: mine.id })
  }

  async createCrew(name: string, password: string): Promise<void> {
    if (!this.state.account) throw new Error('Sign in first')
    if (name.trim().length < 2) throw new Error('Crew name must be at least 2 characters')
    if (password.length < 4) throw new Error('Password must be at least 4 characters')
    this.ensureProfile(this.enterCrew(name), true)
  }

  async joinCrew(name: string, _password: string): Promise<void> {
    if (!this.state.account) throw new Error('Sign in first')
    if (name.trim().length < 2) throw new Error('Enter a crew name')
    this.ensureProfile(this.enterCrew(name), false) // demo: any name/password works
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

  async setAdmin(memberId: string, on: boolean): Promise<void> {
    this.bucket.members = this.bucket.members.map((m) =>
      m.id === memberId ? { ...m, isAdmin: on, updatedAt: Date.now() } : m
    )
    this.persist()
    this.set({ members: this.bucket.members })
  }
}
