# Annual Leave capacity — rule discrepancy (resolved)

Raised while reworking the mobile Annual Leave planner UI (Perplexity's
suggestions on the leave-planner screenshot prompted a "1 of 3 / 2 of 3 / 3
of 3" combined capacity display). The combinations requested for that
redesign didn't match what the app enforced at submission time — flagged
here before changing enforcement silently as a side effect of a UI pass.

## Resolution

vic-ec confirmed the requested combinations against the source EC Leave
Planner Google Sheet: EC COSMO/Intern's cap rises from 1 to 2 concurrent,
and OT COSMO/Intern is folded into the combined 3-doctor cap alongside
MO/Registrar/EC COSMO/Intern (all four columns are "full-time EC doctors"
for the purposes of that combined cap). The combined ceiling stays at 3
total. Implemented in `leaveYearGrid.js`, `leaveRequests.js`,
`EC_LEAVE_PLANNER_RULES.md`, and the `AnnualLeavePlanner.jsx` "How it works"
hint — see those files for the current, live rule. The section below is
kept as a record of the discrepancy that prompted the change.

## Current rule (as it stood before this resolution)

Per-category caps, checked in `checkAnnualLeaveCapacity`
(`src/lib/leaveRequests.js`) against `LEAVE_CAPACITY_COLUMNS`
(`src/lib/leaveYearGrid.js`), overridable per-key in Supabase's
`constraints` table without a redeploy:

| Column | Categories | Max concurrent | Constraint key |
| --- | --- | --- | --- |
| MO | MO | 2 | `leave_max_concurrent_mo` |
| Registrar | Registrar | 1 | `leave_max_concurrent_registrar` |
| EC COSMO / Intern | COSMO, EC_COSMO, EC_COSMO_Intern, Intern | 1 | `leave_max_concurrent_ec_cosmo` |
| OT COSMO / Intern | COSMOPsych, OT_COSMO, OT_COSMO_Intern | 1 | `leave_max_concurrent_ot_cosmo` |

**Combined cap:** MO + Registrar + EC COSMO/Intern together may never
exceed 3 (`leave_max_concurrent_fulltime`, `LEAVE_FULL_TIME_GROUP_KEYS`).
**OT COSMO/Intern is independent of this combined cap** — it isn't folded
in, so under today's rule a day could have 3 "full-time" doctors off *and*
1 OT COSMO/Intern off at the same time (4 people total on annual leave that
day).

Valid 3-doctor combinations reachable under today's rule (EC COSMO/Intern
capped at 1, so it can never contribute 2):

- 1 MO + 1 Registrar + 1 EC COSMO/Intern
- 2 MO + 1 Registrar
- 2 MO + 1 EC COSMO/Intern

(Plus, independently of the above and not counted against them: 1 OT
COSMO/Intern on any of those same days.)

## Requested combinations (for the new "X of 3" mobile display)

> Allowed combinations are: 2 MOs + 1 Reg, OR 2 MOs + 1 OT COSMO/Intern, OR
> 2 MOs + 1 EC COSMO/Intern, OR 2 EC COSMO/Interns + 1 Reg, OR 2 EC
> COSMO/Interns + 1 OT COSMO/Intern, OR 1 MO + 1 Reg + any COSMO/Intern (EC
> or OT).

Two combinations in that list are **not reachable under the current rule**:

- **2 EC COSMO/Interns + 1 Registrar** — needs EC COSMO/Intern's own cap
  raised from 1 to 2.
- **2 EC COSMO/Interns + 1 OT COSMO/Intern** — same EC cap change, plus (for
  the combined "3 of 3" display to mean the same thing as "no one else can
  go on leave that day") OT COSMO/Intern would need to be folded into the
  combined cap group, since today it's independent and not counted toward
  the "3."

## What would need to change to make the requested list exactly right

1. `EC_COSMO` column's `defaultMax` in `LEAVE_CAPACITY_COLUMNS`
   (`src/lib/leaveYearGrid.js`): 1 → 2.
2. `LEAVE_FULL_TIME_GROUP_KEYS`: add `OT_COSMO`, so the combined cap spans
   all four categories (still capped at 3 total), rather than just
   MO/Registrar/EC COSMO.
3. Update `checkAnnualLeaveCapacity`'s error copy, the `EC_LEAVE_PLANNER_RULES.md`
   table, and the `AnnualLeavePlanner.jsx` "How it works" hint to match —
   once (1) and (2) are confirmed, not before, since all three currently
   describe (accurately) what's actually enforced.

This is a real loosening of the live cap (particularly EC COSMO/Intern
going from "never more than 1 off at once" to "up to 2"), so it changes
which real leave requests get approved or blocked going forward — worth a
second pair of eyes before it ships, not something to fold into a UI-only
PR.

## What the mobile UI redesign did independently of this

The mobile UI's "X of 3" capacity figure and the day/month background
colouring (green → yellow → orange → red) are a **read-only visual
indicator**: they show the current *observed* total headcount on leave that
day (all four categories, pending + approved combined), clamped at 3 for the
"at capacity" (red) state. They didn't enforce anything and never depended
on how this question was resolved — now that the cap itself spans all four
columns too, the display and the enforcement agree.

## Decision (resolved)

- [x] Raise EC COSMO/Intern's cap from 1 to 2 concurrent.
- [x] Fold OT COSMO/Intern into the combined 3-doctor cap (previously
      independent, which effectively allowed 4 concurrent).
- [x] Combined ceiling confirmed at 3 total across all four categories.
