-- The scheduling engine's own account of the run that produced a draft
-- (status + summary from POST /generate-roster), saved with the roster so
-- any admin on any device can open it. Written by the app right after a
-- generation; null for rosters built by hand or generated before this.
alter table public.roster_months
  add column if not exists generation_report jsonb;

comment on column public.roster_months.generation_report is
  'Scheduling engine report for the run that produced this draft: {status, entriesWritten, summary, excludedCount, savedAt}. Null when never generated or generated before this column existed.';
