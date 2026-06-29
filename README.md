# VHW EC Roster Builder

A shift scheduling PWA for the VHW Emergency Centre medical team. Replaces a
manual PDF-based rostering process with an automated scheduler, admin tools,
and a doctor-facing portal.

## Stack

- **Frontend:** React + Vite + Tailwind CSS, deployed on Vercel
- **Backend (scheduling engine):** Python FastAPI + OR-Tools, deployed on Render
- **Database / Auth / Storage:** Supabase

## Local development setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the environment template and fill in your Supabase values:
   ```
   cp .env.example .env.local
   ```
   Then edit `.env.local` and set:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — your Supabase publishable key

   Both values are available in Supabase under **Project Settings → API Keys**.

3. Start the dev server:
   ```
   npm run dev
   ```
   The app will be available at `http://localhost:5173`

## Project structure

```
src/
  components/   Shared UI components (layout, route guards)
  context/      React context providers (auth/session state)
  lib/          External service clients (Supabase)
  pages/        Route-level page components
  styles/       Global CSS and Tailwind entry point
```

## Deployment

- **Frontend:** connect this repo to Vercel; set the same environment
  variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) in the
  Vercel project settings.
- **Backend:** see `/backend` (added in a later phase) for the FastAPI
  scheduling engine, deployed separately on Render.

## Build phases

- [x] Phase 1 — Supabase schema, auth, RLS policies
- [x] Phase 2 — React frontend shell, auth flow, staff list (this repo state)
- [ ] Phase 3 — Python scheduling engine (OR-Tools)
- [ ] Phase 4 — Roster grid display + manual editing
- [ ] Phase 5 — Excel export
- [ ] Phase 6 — Doctor portal (leave requests, calendar blocks)
- [ ] Phase 7 — Shift swap workflow
- [ ] Phase 8 — Notifications
- [ ] Phase 9 — Excel re-upload + diff logic
