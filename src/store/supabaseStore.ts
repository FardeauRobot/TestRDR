import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { ConsumptionEvent, GeoPoint, Member } from '../types'
import { BaseStore, type Crew, type NewConsumption, type NewProfile } from './store'

const CREW_KEY = 'crewwatch.crew.v1'
const meKey = (crewId: string) => `crewwatch.me.${crewId}`

interface ProfileRow {
  id: string
  name: string
  emoji: string
  color: string
  is_admin: boolean
  mix_warnings: boolean
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
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    isAdmin: r.is_admin,
    mixWarnings: r.mix_warnings,
    lastCheckIn: new Date(r.last_check_in).getTime(),
    sos: r.sos,
    location:
      r.lat != null && r.lng != null
        ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy ?? undefined, at: r.loc_at ? new Date(r.loc_at).getTime() : Date.now() }
        : undefined,
    updatedAt: new Date(r.updated_at).getTime()
  }
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
  /** True between creating a crew and making the creator's profile (→ admin). */
  private pendingAdmin = false

  constructor(client: SupabaseClient) {
    super()
    this.sb = client
    void this.boot()
  }

  private async boot(): Promise<void> {
    const crew = this.loadCrew()
    if (crew) {
      const meId = localStorage.getItem(meKey(crew.id))
      this.set({ crew, meId })
      await this.enter(crew)
    }
    this.set({ ready: true })
  }

  private loadCrew(): Crew | null {
    try {
      const raw = localStorage.getItem(CREW_KEY)
      return raw ? (JSON.parse(raw) as Crew) : null
    } catch {
      return null
    }
  }

  /** Fetch a crew's data and subscribe to live changes. */
  private async enter(crew: Crew): Promise<void> {
    localStorage.setItem(CREW_KEY, JSON.stringify(crew))
    const meId = localStorage.getItem(meKey(crew.id))
    this.set({ crew, meId, members: [], events: [] })
    await this.refetch(crew.id)
    this.subscribe_(crew.id)
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
      this.sb.from('events').select('*').eq('crew_id', crewId).order('at', { ascending: false }).limit(500)
    ])
    this.set({
      members: (profiles ?? []).map(toMember),
      events: (events ?? []).map(toEvent)
    })
  }

  async createCrew(name: string, password: string): Promise<void> {
    const { data, error } = await this.sb.rpc('create_crew', { p_name: name, p_password: password })
    if (error) throw new Error(humanize(error.message))
    const row = (data as Crew[] | null)?.[0]
    if (!row) throw new Error('Could not create crew')
    this.pendingAdmin = true // creator becomes admin on their next profile
    await this.enter({ id: row.id, name: row.name })
  }

  async joinCrew(name: string, password: string): Promise<void> {
    const { data, error } = await this.sb.rpc('join_crew', { p_name: name, p_password: password })
    if (error) throw new Error(humanize(error.message))
    const row = (data as Crew[] | null)?.[0]
    if (!row) throw new Error('No crew matches that name + password')
    this.pendingAdmin = false
    await this.enter({ id: row.id, name: row.name })
  }

  async leaveCrew(): Promise<void> {
    if (this.channel) {
      void this.sb.removeChannel(this.channel)
      this.channel = null
    }
    localStorage.removeItem(CREW_KEY)
    this.set({ crew: null, meId: null, members: [], events: [] })
  }

  async createProfile(input: NewProfile): Promise<void> {
    const crew = this.state.crew
    if (!crew) return
    const { data, error } = await this.sb
      .from('profiles')
      .insert({ crew_id: crew.id, name: input.name, emoji: input.emoji, color: input.color, is_admin: this.pendingAdmin })
      .select()
      .single()
    if (error || !data) throw error ?? new Error('Could not create profile')
    this.pendingAdmin = false
    localStorage.setItem(meKey(crew.id), data.id)
    this.set({ meId: data.id, members: [...this.state.members, toMember(data)] })
  }

  private async patchMe(patch: Record<string, unknown>): Promise<void> {
    const { meId, crew } = this.state
    if (!meId || !crew) return
    await this.sb.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', meId)
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
    await this.patchMe({ last_check_in: new Date().toISOString() })
  }

  async checkIn(): Promise<void> {
    await this.patchMe({ last_check_in: new Date().toISOString(), sos: false })
  }

  async setSos(on: boolean): Promise<void> {
    await this.patchMe({ sos: on, last_check_in: new Date().toISOString() })
  }

  async updateLocation(point: GeoPoint | null): Promise<void> {
    await this.patchMe(
      point
        ? { lat: point.lat, lng: point.lng, accuracy: point.accuracy ?? null, loc_at: new Date(point.at).toISOString() }
        : { lat: null, lng: null, accuracy: null, loc_at: null }
    )
  }

  async setMixWarnings(on: boolean): Promise<void> {
    await this.patchMe({ mix_warnings: on })
  }

  async removeMember(memberId: string): Promise<void> {
    const crew = this.state.crew
    if (!crew) return
    await this.sb.from('profiles').delete().eq('id', memberId) // events cascade-delete
    await this.refetch(crew.id)
  }

  async clearMemberSos(memberId: string): Promise<void> {
    const crew = this.state.crew
    if (!crew) return
    await this.sb
      .from('profiles')
      .update({ sos: false, last_check_in: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', memberId)
    await this.refetch(crew.id)
  }
}

/** Strip Postgres prefixes so users see a clean message. */
function humanize(msg: string): string {
  return msg.replace(/^.*(?:exception|error):\s*/i, '').trim() || 'Something went wrong'
}
