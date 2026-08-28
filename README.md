# RotaCat

A shift scheduling PWA for the VHW Emergency Centre medical team. Replaces a
manual PDF-based rostering process with an automated scheduler, admin tools,
and a doctor-facing portal. This tool was created independently and is not 
endorsed by WCG, NDoH, or VHW. 

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

### Previewing a branch: the `preview` branch

Every branch pushed here gets its own Vercel preview deployment, but you can
only *sign in* on one of them.

Login is gated by Cloudflare Turnstile, and a Turnstile site key only issues
tokens on hostnames listed in its Hostname Management allowlist. A per-branch
preview URL (`rotacat-git-<branch>-vhw-ec.vercel.app`) is not on that list, so
the widget fails with error 110200 (domain not allowed), no token arrives, and
the submit button stays disabled. Unsetting `VITE_TURNSTILE_SITE_KEY` for the
Preview environment does not help — Supabase Auth verifies the captcha
server-side, so sign-in then fails for a *missing* token instead. Nor is there
a wildcard: Cloudflare rejects `vercel.app` as a public-suffix domain.

So there is one long-lived branch, `preview`, whose Vercel alias never changes:

```
https://rotacat-git-preview-vhw-ec.vercel.app
```

That hostname is allowlisted in the Turnstile widget's Hostname Management
list, so sign-in works there. Nothing needs to change in Cloudflare for a new
branch.

To review a branch, point `preview` at its head:

```
git fetch origin
git push --force origin origin/<branch-to-review>:refs/heads/preview
```

Vercel redeploys and re-aliases the same hostname to that commit. `preview` is
a disposable review pointer, never a source of truth: don't commit to it, don't
merge from it, and expect anyone to force-move it at any time.

Preview deployments are behind Vercel SSO (deployment protection is on for
everything except custom domains), so a reviewer also needs access to the
Vic-EC Vercel team to open them.

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

See [`FUTURE_IDEAS.md`](./FUTURE_IDEAS.md) for unscoped feature ideas not yet
tied to a build phase.

## License

This repository is proprietary — see [`LICENSE`](./LICENSE). It is published
on GitHub for visibility and collaboration, not as open-source software; no
license to use, copy, modify, or redistribute the code is granted.
