import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Account, ConsumptionEvent, Member, GeoPoint } from '../types'
import { BaseStore, type Crew, type NewConsumption, type NewProfile } from './store'
import { CREW_KEY, loadAccount, loadCrew, saveAccount } from './persist'

interface ProfileRow {
  id: string
  account_id: string | null
  name: string
  emoji: string
  color: string
  is_admin: boolean
  mix_warnings: boolean
  status: string | null
  status_at: string | null
  last_check_in: string
  sos: boolean
  lat: number | null
  lng: number | null
  accuracy: number | null
  loc_at: string | null
  updated_at: string
}

interface EventRow {
  id: string
  member_id: string
  substance_id: string
  dose: string | null
  note: string | null
  at: string
}

function toMember(r: ProfileRow): Member {
  return {
    id: r.id,
    accountId: r.account_id ?? undefined,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    isAdmin: r.is_admin,
    mixWarnings: r.mix_warnings,
    status: r.status ?? undefined,
    statusAt: r.status_at ? new Date(r.status_at).getTime() : undefined,
    lastCheckIn: new Date(r.last_check_in).getTime(),
    sos: r.sos,
    location:
      r.lat != null && r.lng != null
        ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy ?? undefined, at: r.loc_at ? new Date(r.loc_at).getTime() : Date.now() }
        : undefined,
    updatedAt: new Date(r.updated_at).getTime()
  }
}

/** Inverse of `toMember`: a camelCase member patch → a snake_case profile-row patch.
 *  Only keys present in `patch` are written, so callers speak domain types and the
 *  column-name knowledge lives in exactly one place. */
function toRow(patch: Partial<Member>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if ('name' in patch) row.name = patch.name
  if ('emoji' in patch) row.emoji = patch.emoji
  if ('color' in patch) row.color = patch.color
  if ('isAdmin' in patch) row.is_admin = patch.isAdmin
  if ('mixWarnings' in patch) row.mix_warnings = patch.mixWarnings
  if ('status' in patch) row.status = patch.status ?? null
  if ('statusAt' in patch) row.status_at = patch.statusAt ? new Date(patch.statusAt).toISOString() : null
  if ('lastCheckIn' in patch) row.last_check_in = new Date(patch.lastCheckIn as number).toISOString()
  if ('sos' in patch) row.sos = patch.sos
  if ('location' in patch) {
    const loc = patch.location
    row.lat = loc?.lat ?? null
    row.lng = loc?.lng ?? null
    row.accuracy = loc?.accuracy ?? null
    row.loc_at = loc ? new Date(loc.at).toISOString() : null
  }
  return row
}

function toEvent(r: EventRow): ConsumptionEvent {
  return {
    id: r.id,
    memberId: r.member_id,
    substanceId: r.substance_id,
    dose: r.dose ?? undefined,
    note: r.note ?? undefined,
    at: new Date(r.at).getTime()
  }
}

/** Cross-device store backed by Supabase (Postgres + realtime). */
export class SupabaseStore extends BaseStore {
  readonly mode = 'synced' as const
  private sb: SupabaseClient
  private channel: RealtimeChannel | null = null

  constructor(client: SupabaseClient) {
    super()
    this.sb = client
    void this.boot()
  }

  private async boot(): Promise<void> {
    const account = loadAccount()
    this.set({ account })
    if (account) {
      const crew = loadCrew()
      if (crew) await this.enter(crew, false)
    }
    this.set({ ready: true })
  }

  /** Fetch a crew's data, ensure this account has a member, subscribe to changes. */
  private async enter(crew: Crew, createAsAdmin: boolean): Promise<void> {
    localStorage.setItem(CREW_KEY, JSON.stringify(crew))
    this.set({ crew, meId: null, members: [], events: [] })
    await this.refetch(crew.id)
    if (!this.state.meId) await this.createMyProfile(crew.id, createAsAdmin)
    this.subscribe_(crew.id)
  }

  /** Insert this account's member in the crew (idempotent — a unique (crew_id,
   *  account_id) index means a concurrent insert just resolves via refetch). */
  private async createMyProfile(crewId: string, asAdmin: boolean): Promise<void> {
    const account = this.state.account
    if (!account) return
    const { error } = await this.sb.from('profiles').insert({
      crew_id: crewId,
      account_id: account.id,
      name: account.nickname,
      emoji: account.emoji,
      color: account.color,
      is_admin: asAdmin
    })
    // 23505 = unique_violation: the member already exists (another device/tab).
    if (error && error.code !== '23505') throw error
    await this.refetch(crewId)
  }

  private subscribe_(crewId: string): void {
    if (this.channel) void this.sb.removeChannel(this.channel)
    this.channel = this.sb
      .channel(`crew:${crewId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `crew_id=eq.${crewId}` }, () => void this.refetch(crewId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `crew_id=eq.${crewId}` }, () => void this.refetch(crewId))
      .subscribe()
  }

  private async refetch(crewId: string): Promise<void> {
    const [{ data: profiles }, { data: events }] = await Promise.all([
      this.sb.from('profiles').select('*').eq('crew_id', crewId),
      // NOTE: 500-event cap is a known boundary — a long-lived crew exceeding it
      // will drop its oldest logs from timers/history. Paginate/scope by time if hit.
      this.sb.from('events').select('*').eq('crew_id', crewId).order('at', { ascending: false }).limit(500)
    ])
    const members = ((profiles ?? []) as ProfileRow[]).map(toMember)
    // "Me" is the profile tied to my account; null if it's gone (kicked/crew deleted).
    const accountId = this.state.account?.id
    const meId = (accountId && members.find((m) => m.accountId === accountId)?.id) || null
    this.set({ members, events: ((events ?? []) as EventRow[]).map(toEvent), meId })
  }

  async signup(nickname: string, password: string, emoji: string, color: string): Promise<void> {
    const { data, error } = await this.sb.rpc('signup', { p_nickname: nickname, p_password: password, p_emoji: emoji, p_color: color })
    if (error) throw new Error(humanize(error.message))
    const account = (data as Account[] | null)?.[0]
    if (!account) throw new Error('Could not create account')
    saveAccount(account)
    this.set({ account })
  }

  async login(nickname: string, password: string): Promise<void> {
    const { data, error } = await this.sb.rpc('login', { p_nickname: nickname, p_password: password })
    if (error) throw new Error(humanize(error.message))
    const account = (data as Account[] | null)?.[0]
    if (!account) throw new Error('Wrong nickname or password')
    saveAccount(account)
    this.set({ account })
  }

  async logout(): Promise<void> {
    if (this.channel) {
      void this.sb.removeChannel(this.channel)
      this.channel = null
    }
    saveAccount(null)
    localStorage.removeItem(CREW_KEY)
    this.set({ account: null, crew: null, meId: null, members: [], events: [] })
  }

  async updateAccount(patch: { emoji?: string; color?: string }): Promise<void> {
    const account = this.state.account
    if (!account) return
    const next = { ...account, ...patch }
    const { error } = await this.sb.rpc('update_account', { p_id: account.id, p_emoji: next.emoji, p_color: next.color })
    if (error) throw new Error(humanize(error.message))
    saveAccount(next)
    this.set({ account: next })
    await this.patchMe(patch) // reflect the new avatar on the current crew profile
  }

  async createCrew(name: string, password: string): Promise<void> {
    if (!this.state.account) throw new Error('Sign in first')
    const { data, error } = await this.sb.rpc('create_crew', { p_name: name, p_password: password })
    if (error) throw new Error(humanize(error.message))
    const row = (data as Crew[] | null)?.[0]
    if (!row) throw new Error('Could not create crew')
    await this.enter({ id: row.id, name: row.name }, true) // creator → admin
  }

  async joinCrew(name: string, password: string): Promise<void> {
    if (!this.state.account) throw new Error('Sign in first')
    const { data, error } = await this.sb.rpc('join_crew', { p_name: name, p_password: password })
    if (error) throw new Error(humanize(error.message))
    const row = (data as Crew[] | null)?.[0]
    if (!row) throw new Error('No crew matches that name + password')
    await this.enter({ id: row.id, name: row.name }, false)
  }

  async leaveCrew(): Promise<void> {
    if (this.channel) {
      void this.sb.removeChannel(this.channel)
      this.channel = null
    }
    localStorage.removeItem(CREW_KEY)
    this.set({ crew: null, meId: null, members: [], events: [] })
  }

  async deleteCrew(password: string): Promise<void> {
    const crew = this.state.crew
    if (!crew) return
    const { data, error } = await this.sb.rpc('delete_crew', { p_name: crew.name, p_password: password })
    if (error) throw new Error(humanize(error.message))
    if (!data) throw new Error('Wrong crew password — nothing deleted')
    await this.leaveCrew()
  }

  /** Patch this device's own profile. Takes a camelCase domain patch. */
  private async patchMe(patch: Partial<Member>): Promise<void> {
    const { meId } = this.state
    if (!meId) return
    await this.patchMember(meId, patch)
  }

  /** Patch any member's profile (admin paths gate this in the UI). */
  private async patchMember(memberId: string, patch: Partial<Member>): Promise<void> {
    const crew = this.state.crew
    if (!crew) return
    await this.sb.from('profiles').update({ ...toRow(patch), updated_at: new Date().toISOString() }).eq('id', memberId)
    await this.refetch(crew.id)
  }

  async updateProfile(patch: Partial<NewProfile>): Promise<void> {
    await this.patchMe(patch)
  }

  async logConsumption(input: NewConsumption): Promise<void> {
    const { meId, crew } = this.state
    if (!meId || !crew) return
    await this.sb.from('events').insert({
      crew_id: crew.id,
      member_id: meId,
      substance_id: input.substanceId,
      dose: input.dose ?? null,
      note: input.note ?? null
    })
    await this.patchMe({ lastCheckIn: Date.now() }) // logging counts as a check-in
  }

  async checkIn(): Promise<void> {
    await this.patchMe({ lastCheckIn: Date.now(), sos: false })
  }

  async setSos(on: boolean): Promise<void> {
    await this.patchMe({ sos: on, lastCheckIn: Date.now() })
  }

  async updateLocation(point: GeoPoint | null): Promise<void> {
    await this.patchMe({ location: point ?? undefined })
  }

  async setStatus(text: string): Promise<void> {
    const now = Date.now()
    const t = text.trim()
    await this.patchMe({ status: t || undefined, statusAt: t ? now : undefined, lastCheckIn: now })
  }

  async setMixWarnings(on: boolean): Promise<void> {
    await this.patchMe({ mixWarnings: on })
  }

  async removeMember(memberId: string): Promise<void> {
    const crew = this.state.crew
    if (!crew) return
    await this.sb.from('profiles').delete().eq('id', memberId) // events cascade-delete
    await this.refetch(crew.id)
  }

  async clearMemberSos(memberId: string): Promise<void> {
    await this.patchMember(memberId, { sos: false, lastCheckIn: Date.now() })
  }

  async setAdmin(memberId: string, on: boolean): Promise<void> {
    await this.patchMember(memberId, { isAdmin: on })
  }
}

/** Strip Postgres prefixes so users see a clean message. */
function humanize(msg: string): string {
  return msg.replace(/^.*(?:exception|error):\s*/i, '').trim() || 'Something went wrong'
}
