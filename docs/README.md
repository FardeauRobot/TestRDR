# Crew Watch — documentation

Developer documentation for **Crew Watch**, a private harm-reduction "buddy crew"
PWA. These docs explain *what was built, how it fits together, and why* so new
features can slot in without re-discovering everything.

> User-facing setup lives in the repo root: [`README.md`](../README.md),
> [`SETUP-SUPABASE.md`](../SETUP-SUPABASE.md), [`DEPLOY.md`](../DEPLOY.md).
> The condensed orientation note is [`RECAP.md`](../RECAP.md); this folder is its
> expanded, structured form. The agent contract is [`CLAUDE.md`](../CLAUDE.md).

## Read in order

| # | Doc | What it covers |
|---|-----|----------------|
| 1 | [Overview](01-overview.md) | What the app is, the hard constraints, the stack |
| 2 | [Architecture](02-architecture.md) | Two-mode store, data flow, `BaseStore`, the React seam |
| 3 | [Data model](03-data-model.md) | Domain types, the `CrewStore` interface, storage keys |
| 4 | [Domain logic](04-domain-logic.md) | Timers, statuses, mixing/redose logic, the interaction chart |
| 5 | [Backend (Supabase)](05-backend-supabase.md) | Schema, RPCs, RLS, realtime, the trust model |
| 6 | [UI & navigation](06-ui-and-navigation.md) | The router, screens, components, styling system |
| 7 | [Development & deploy](07-development-and-deploy.md) | Commands, conventions, gotchas, hosting |
| 8 | [Build log](08-build-log.md) | Step-by-step of what was built, in order |
| 9 | [Tech-debt review](09-tech-debt-and-review.md) | The two code reviews, what was fixed, what's deferred |
| 10 | [Interface & features brief](10-interface-and-features.md) | Locked design decisions for the redesign + new features (not yet built) |

## The one rule to remember

Every user action that changes crew state goes through the **`CrewStore`
interface** (`src/store/store.ts`) and must be implemented in **both** stores
(`demoStore.ts`, `supabaseStore.ts`) — plus the SQL schema if it touches synced
data. Screens never know which mode they're in. See [Architecture](02-architecture.md).
