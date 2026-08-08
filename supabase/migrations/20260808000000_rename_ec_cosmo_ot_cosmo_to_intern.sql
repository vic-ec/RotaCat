-- Renames the two still-COSMO-named staff_category enum values (EC_COSMO,
-- OT_COSMO) to EC_Intern/OT_Intern — the wider COSMO->Intern terminology
-- swap missed these two. Confirmed zero live profiles rows use either value
-- today (they're dormant, reserved for Jan 2027 — see StaffListPage.jsx/
-- GenerationConfigPage.jsx's own "Future values" comments), so this is a
-- pure rename with no data to migrate. Deliberately leaves EC_COSMO_Intern/
-- OT_COSMO_Intern untouched — those are reserved for a separate, unrelated
-- future EC/OT distinction feature (see internRotations.js).
alter type staff_category rename value 'EC_COSMO' to 'EC_Intern';
alter type staff_category rename value 'OT_COSMO' to 'OT_Intern';

-- The two matching constraints rows (per-column leave concurrency caps)
-- need the same rename so the app's constraintKey lookups keep finding them.
update constraints set key = 'leave_max_concurrent_ec_intern' where key = 'leave_max_concurrent_ec_cosmo';
update constraints set key = 'leave_max_concurrent_ot_intern' where key = 'leave_max_concurrent_ot_cosmo';
