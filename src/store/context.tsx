import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { supabase, SYNC_ENABLED } from '../lib/supabase'
import { DemoStore } from './demoStore'
import { SupabaseStore } from './supabaseStore'
import type { CrewState, CrewStore } from './store'

/** One store for the whole app, chosen at startup. */
const store: CrewStore =
  SYNC_ENABLED && supabase ? new SupabaseStore(supabase) : new DemoStore()

const StoreContext = createContext<CrewStore>(store)

export function StoreProvider({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): CrewStore {
  return useContext(StoreContext)
}

/** Subscribe to the live crew state. */
export function useCrew(): CrewState {
  const s = useStore()
  return useSyncExternalStore(
    (cb) => s.subscribe(cb),
    () => s.getState()
  )
}
