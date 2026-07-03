# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RotaCat is a shift scheduling PWA for the VHW Emergency Centre medical team, replacing a manual PDF-based rostering process. This repo currently contains only the **frontend**; the Python scheduling backend lives in a separate service (see Architecture below).

## Commands

```bash
npm install          # install dependencies
npm run dev           # start Vite dev server at http://localhost:5173
npm run build          # production build
npm run preview         # preview the production build locally
npm run lint           # eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0
```

There is no test suite in this repo yet.

Local setup requires `.env.local` (copy from `.env.example`) with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SCHEDULER_URL`. The Supabase client (`src/lib/supabase.js`) throws at import time if the Supabase vars are missing, so the app won't boot without them.

## Architecture

**Stack split across three services:**
- Frontend: React + Vite + Tailwind, this repo, deployed on Vercel
- Scheduling engine: Python FastAPI + OR-Tools, deployed on Render (separate repo/service — not in this codebase; called only via `VITE_SCHEDULER_URL`)
- Supabase: Postgres database, auth, and RLS policies — the source of truth for all data. The frontend talks to Supabase directly via `@supabase/supabase-js` for all reads/writes except roster generation.

**Two backend touchpoints from the frontend:**
1. `src/lib/supabase.js` — direct Postgres access (staff, rosters, leave, entries) via the Supabase JS client, gated by RLS policies configured in the Supabase project itself (not visible in this repo).
2. `src/lib/schedulerApi.js` — the only place that calls the Render FastAPI service. Currently one real endpoint (`POST /generate-roster`) plus a `/health` poll used to detect Render's free-tier cold start (~30-60s wake time). Keep all scheduler HTTP calls centralized here rather than calling `fetch` from page components.

**Auth flow** (`src/context/AuthContext.jsx` + `src/components/ProtectedRoute.jsx`):
- Supabase auth session drives a `profiles` table lookup (role, `is_approved`, name/surname/category) — the profile row, not the auth user, is what the rest of the app reads from `useAuth()`.
- New signups aren't usable until an admin sets `is_approved = true` on their profile; unapproved users are routed to `/pending` regardless of what URL they hit (see the `PendingRoute` wrapper in `App.jsx`).
- `isAdmin` is derived from `profile.role === 'admin'` and drives both route guarding (`ProtectedRoute adminOnly`) and which nav items render in `AppLayout` (`adminNav` vs `doctorNav`).

**Routing** (`src/App.jsx`): all authenticated routes nest under one `ProtectedRoute` + `AppLayout` shell. Unbuilt phases are wired up front with `PlaceholderPage` rather than left unrouted — follow that pattern when stubbing a future phase instead of omitting the route.

**Roster domain model** (see `src/pages/RosterGridPage.jsx` for the fullest picture): `roster_months` (one row per year+month, status `draft`/`published`/`archived`) has many `roster_entries` (date + position + profile_id + shift_type_id). Shift codes are day-type-dependent — weekday, weekend, and public-holiday days each have a different shift set (`WD_*`, `WE_*`, `PHW_*`, `PH_*`), looked up per-date against `public_holidays`. `staff_reference`/`profiles` carry scheduling constraints per doctor (`contract_type`, `min_hours`/`max_hours`, `weekend_day_saturday_only`, `no_weekend_nights`) that the OR-Tools backend consumes — the frontend mostly displays/edits these, it doesn't enforce them.

**Styling**: Tailwind with a custom design-token palette in `tailwind.config.js` — use the semantic tokens (`ink`, `canvas`, `accent`, `rose`, `flagRed`/`flagAmber`/`flagBlue`/`success`) rather than raw Tailwind colors. The `flag*`/`success` colors are reserved strictly for roster-state semantics (draft/published/conflict indicators) — don't reach for them as general-purpose UI colors. Shared component classes (`.btn-primary`, `.btn-secondary`, `.card`, `.input-field`, `.label-text`) are defined once in `src/styles/index.css` under `@layer components`; prefer reusing them over ad hoc utility strings for buttons/cards/inputs. There's also an unused/exploratory dark theme (`night`, `graphite` tokens) kept as its own namespace, not yet wired into any page.

**PWA**: configured in `vite.config.js`. Supabase REST responses are cached with a `NetworkFirst` strategy (24h expiry) so doctors can view shifts on poor hospital wifi — keep this in mind if changing Supabase query shapes, as stale cached shapes need to stay compatible for offline use.
