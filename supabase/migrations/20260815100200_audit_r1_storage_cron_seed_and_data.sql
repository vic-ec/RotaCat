-- Audit round 1 — storage limits, cron repair, constraint seed, comment fix,
-- and test-account deactivation.

-- 1.8: avatars bucket had no size or MIME restrictions.
UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5MB
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE id = 'avatars';

-- 1.10: job 2's stored command filtered on `role != 'admin'`, but role is an
-- enum of doctor/locum/clerk only, so every run threw
-- "invalid input value for enum user_role" (22/22 recent runs failed).
-- Reference the is_admin column directly -- not the is_admin() function, which
-- has no auth.uid() session context under cron. The job stays inactive;
-- re-enabling it is a separate decision about the dormancy threshold.
SELECT cron.alter_job(
  job_id => 2,
  command => $cron$
    update profiles
    set is_active = false
    where is_active = true
      and is_approved = true
      and is_admin = false
      and id in (
        select id from auth.users
        where last_sign_in_at < now() - interval '72 days'
          or (last_sign_in_at is null and created_at < now() - interval '72 days')
      );
  $cron$
);

-- 1.11: backend falls back to a hardcoded 4500 until this key exists.
-- NOTE: 4500 is inferred from weekend_alternation_strict's description text,
-- not confirmed against RosterSolver.add_objective (that repo is not accessible).
INSERT INTO constraints (key, value, value_type, category, description)
VALUES (
  'weekend_alternation_soft_penalty',
  '4500',
  'int',
  'weekends',
  'Objective-function weight for the weekend day/night alternation soft constraint (see weekend_alternation_strict). Was hardcoded as a fallback in the scheduler until seeded here.'
)
ON CONFLICT (key) DO NOTHING;

-- 1.12: the comment claimed a DB trigger (sync_profile_from_intern_rotation)
-- that does not exist.
COMMENT ON COLUMN profiles.psych_subcategory IS
'DPM_BCH / LRCHC / PSYCH — only meaningful when contract_type=Junior_Doctor_Overtime. Read by the scheduling backend (RosterSolver.add_psych_subcategory_restrictions). For Intern/COSMO doctors this is synced from intern_rotations.subtype by the client-side syncProfileFromCurrentRotation() (src/lib/internRotations.js), triggered only when someone writes to intern_rotations through the app — there is no DB trigger or scheduled job, so a rotation that lapses without being re-saved will leave this stale. Otherwise admin-set directly.';

-- 1.13: test/dummy accounts sitting in production. Deactivated, not deleted --
-- reversible, and avoids auth.users cascade complications.
UPDATE profiles SET is_active = false, is_approved = false, is_rejected = true
WHERE id IN ('598ccb0a-2958-44ce-92d0-72d593746cf0', '6b3fbf41-7fbe-424b-a178-3dfe8687c58d');
