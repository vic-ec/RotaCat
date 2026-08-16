-- Reverses the 1.13 deactivation in 20260815100200_audit_r1_storage_cron_seed_and_data.sql.
--
-- That pass treated "Claude CodeSpace" and "Claude Cucumber" as stale dummy
-- rows, but they are working test logins still in active use. Deactivating
-- them set three columns at once, and each one broke something separately:
--
--   is_active  = false  -> dropped out of the Staff List, and landed in
--                          Rotations -> Completed (InternRotationsPlanner
--                          classifies !is_active && !scheduled_active_date
--                          as "completed", which reads as a lapsed rotation
--                          even though no rotation had lapsed)
--   is_approved = false -> login redirected to /pending, "waiting for admin
--                          approval" (PendingRoute in App.jsx)
--   is_rejected = true  -> also hidden from the admin Pending Approvals
--                          queue, which filters is_approved=false AND
--                          is_rejected=false -- so it could not be undone
--                          from the UI either
--
-- Note that the Rotations "Reactivate" button only sets is_active, so it
-- could not have fully undone this on its own: the account would have come
-- back to the Staff List while still bouncing to /pending on login.
--
-- Restores the exact pre-1.13 state. Does not touch is_admin, role, category,
-- or any intern_rotations rows.
UPDATE profiles
SET is_active = true, is_approved = true, is_rejected = false
WHERE id IN ('598ccb0a-2958-44ce-92d0-72d593746cf0', '6b3fbf41-7fbe-424b-a178-3dfe8687c58d');
