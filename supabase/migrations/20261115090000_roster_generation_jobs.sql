-- Roster generation as a background job.
--
-- Generation used to be one long web request from the admin's browser to
-- the Render scheduler. It now runs on a GitHub Actions runner (see the
-- RotaCatScheduler repo: .github/workflows/generate-roster.yml), which
-- takes about five minutes and cannot answer a browser request directly.
-- This table is the hand-off between the two:
--
--   1. the roster-generation Edge Function inserts a 'queued' row and
--      starts the GitHub workflow with the row's id;
--   2. the runner marks it 'running', then 'succeeded' (with the draft's
--      roster_month_id and a result summary) or 'failed' (with the
--      technical detail an admin needs to troubleshoot);
--   3. the app reads the row to show progress and open the draft.
--
-- Only admins can read it, and nobody can write it from the browser:
-- inserts and updates happen with the service role (Edge Function and
-- runner), so a job's status always reflects what the runner really did.
create table public.roster_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2024 and 2100),
  month integer not null check (month between 1 and 12),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  use_carry_forward boolean not null default false,
  excluded_profile_ids uuid[] not null default '{}',
  requested_by uuid references public.profiles(id) on delete set null,
  roster_month_id uuid references public.roster_months(id) on delete set null,
  message text,
  error_detail text,
  summary jsonb,
  github_run_id bigint,
  github_run_url text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.roster_generation_jobs is
  'One row per roster generation request. Written only by the roster-generation Edge Function and the GitHub Actions runner (service role); admins read it to follow progress.';
comment on column public.roster_generation_jobs.error_detail is
  'Technical failure detail (error text / traceback) shown to admins for troubleshooting.';
comment on column public.roster_generation_jobs.summary is
  'Result report from the runner: solver status and time, flags, validator result, understaffed slots.';

-- One active job per month: a second click while one is queued or running
-- must find the existing job rather than start a competing run that would
-- overwrite the same draft.
create unique index roster_generation_jobs_one_active_per_month
  on public.roster_generation_jobs (year, month)
  where status in ('queued', 'running');

create index roster_generation_jobs_created_at_idx
  on public.roster_generation_jobs (created_at desc);

create trigger roster_generation_jobs_updated_at
  before update on public.roster_generation_jobs
  for each row execute function update_updated_at();

alter table public.roster_generation_jobs enable row level security;

create policy roster_generation_jobs_admin_select
  on public.roster_generation_jobs
  for select
  to authenticated
  using (is_admin());

revoke all on public.roster_generation_jobs from anon;
revoke insert, update, delete, truncate on public.roster_generation_jobs from authenticated;
