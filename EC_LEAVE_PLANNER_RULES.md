# EC Leave Planner, Special Requests, and Weekend Requests Planner — Rules & Guidelines

Transcribed from the team's existing EC Leave Planner Google Sheet, which
this repo's Annual Leave / Special Leave planner tabs (`/leave`) are built
to mirror. Source: [EC Leave Planner sheet](https://docs.google.com/spreadsheets/d/1-6KyFaVamlzcf2CjZdrrZEDa9OUFOOQ_bPsTV7i_GqI/edit).
Update this file if the source sheet's rules change — it's the reference
the in-app "Rules" boxes on each planner tab are kept in sync with.

## There are two planners

1. **Annual Leave Planner**
2. **Single Day/s, Courses, Special Leave + Weekend Request Planner**

The second planner is for days you want off, or a special request — these
**do not count as Annual Leave days**. The requested shift/day is made up
elsewhere, unless it's a "special leave day" (see below).

## General rules (both planners)

- Use **surnames** (not first names) when populating a planner.
- **No more than one person per slot.**
- Names are organised into groups and rotations. If your name appears in a
  specific colour for a given month, you work **all** the weekends in that
  colour that month.

## Annual Leave rules

Applies to everyone working in EC — MOs, Registrars, EC Interns, Psych
Interns, and Overtime Interns:

- An **Annual Leave form must be submitted and approved**. **22 days**
  annual leave are available per yearly cycle.
- If taking **5 days' leave**, you may take the weekend on either side, but
  any "on" weekend hours must be made up elsewhere (on another weekend).
- If taking **10 days' leave (2 weeks)** and the "middle weekend" is an "on"
  weekend, those hours do **not** need to be made up — they're included in
  the leave.
- If leave spans a period that includes a **public holiday**, the PH counts
  as a shift/leave day — or the hours are worked/made up elsewhere.
- All actual annual leave days taken (per the approved Leave Form) are shown
  in **bold** on the sheet.

**How the app enforces the capacity limit:** the sheet's "no more than one
person per slot" rule is applied to the Annual Leave grid as a hard cap per
category column, plus a combined cap across the three "full-time doctor"
columns together — both checked automatically when a doctor submits an
annual leave request, not just displayed after the fact:

| Column | Categories | Max concurrent |
| --- | --- | --- |
| MO | MO | 2 |
| Registrar | Registrar | 1 |
| EC COSMO / Intern | COSMO, EC_COSMO, EC_COSMO_Intern, Intern | 1 |
| OT COSMO / Intern | COSMOPsych, OT_COSMO, OT_COSMO_Intern | 1 |

**Combined cap — no more than 3 full-time doctors (MO + Registrar + EC
COSMO/Intern combined) on leave at once.** OT COSMO/Intern is a separate
stream and isn't part of this combined cap. Valid combinations at the
3-doctor ceiling:

- 1 MO + 1 Registrar + 1 EC COSMO/Intern
- 2 MO + 1 Registrar
- 2 MO + 1 EC COSMO/Intern

Never more than 1 Registrar or more than 1 EC COSMO/Intern concurrently
(each already capped at 1 above), and never more than 3 full-time doctors
combined even if each individual column is still under its own cap.

Consultant doctors are still shown on the grid (an uncapped "Other"
column) so their leave isn't hidden, but no concurrency cap applies to
them. These numbers are configurable in Supabase (`constraints` table:
`leave_max_concurrent_mo` / `_registrar` / `_ec_cosmo` / `_ot_cosmo` /
`_fulltime`) without a redeploy, in case the real caps change.

## Special / Single-day / Course leave rules

- Covers single days off, courses/CPD, and special leave requests.
- These do **not** count against the 22-day annual leave allowance.
- The requested day/shift is made up elsewhere, **unless** it's flagged as a
  "special leave day."
- Pending requests of any leave type (including annual leave awaiting
  approval) also show here, since they haven't been approved onto the
  Annual Leave planner yet.

## Weekend Request Planner rules

- Weekend rotations are organised in columns by MO / Registrar / EC COSMO /
  OT COSMO, colour-coded per doctor group.
- If your name is listed in a specific colour for a given month, you work
  **every** weekend in that colour that month.
- No more than one person per slot.

## How to request leave

1. Submit the appropriate request through the app's Leave tab (**My
   leave**) — choose the correct leave type (Annual, Single day, Special
   leave, Course/CPD, Sick, or Weekend exception); this is the same
   distinction the sheet draws between the Annual Leave Planner and the
   Special Requests Planner.
2. An admin reviews and approves (or rejects) the request before it's
   confirmed — approved annual leave then appears on the Annual Leave
   planner; everything else (and anything still pending) appears on the
   Special Leave planner.
3. Populate/refer to the planner using **surnames**, matching the sheet's
   convention.
