-- The roster change log names the person put on a shift by profile id. A
-- locum added by name and mobile only has no profile, so the log had nobody
-- to name and the review log showed "(unassigned)" for a shift that had just
-- been filled. Their name was being tucked into the free-text note, which
-- the review log does not read (and should not have to parse).
--
-- locum_name: the locum put on the shift, when they have no account. NULL
-- for every other change.

alter table public.roster_entry_changes
  add column if not exists locum_name text;

comment on column public.roster_entry_changes.locum_name is
  'Name of the locum put on the shift when they have no account (no profile_id_after to name them by).';

-- Rows already written in the old form: lift the name out of the note.
update public.roster_entry_changes
set
  locum_name = substring(note from 'locum (.+) \(no account yet\)'),
  note = nullif(btrim(regexp_replace(note, '(; )?(covered by )?locum .+ \(no account yet\)', ''), '; '), '')
where locum_name is null
  and note ~ 'locum .+ \(no account yet\)';
