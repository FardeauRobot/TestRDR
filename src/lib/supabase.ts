import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Non-null only when both env vars are set → app runs in synced mode.
 *  Crews are created/joined at runtime (name + password), not via env. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : null

export const SYNC_ENABLED = supabase !== null
