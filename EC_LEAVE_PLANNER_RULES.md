# EC Leave Planner, Special Requests, and Weekend Requests Planner — Rules & Guidelines

Transcribed from the team's existing EC Leave Planner Google Sheet, which
this repo's Annual Leave / Special Leave planner tabs (`/leave`) are built
to mirror. Source: [EC Leave Planner sheet](https://docs.google.com/spreadsheets/d/1-6KyFaVamlzcf2CjZdrrZEDa9OUFOOQ_bPsTV7i_GqI/edit).
Update this file if the source sheet's rules change — it's the reference
the in-app "Rules" boxes on each planner tab are kept in sync with.

## There are three planners

1. **Annual Leave Planner**
2. **Single Day/s, Courses, Special Leave Planner**
3. **Weekend Request Planner**

The second is for days you want off, or a special request — these
**do not count as Annual Leave days**. The requested shift/day is made up
elsewhere, unless it's a "special leave day" (see below).

## General rules (both planners)

- Use **surnames** (not first names) when populating a planner.
- **No more than one person per slot.**
- Names are organised into groups and rotations. If your name appears in a
  specific colour for a given month, you work **all** the weekends in that
  colour that month.

## Consultant leave privacy

A Consultant's leave request — of **any** leave type, including a weekend
exception — is only visible to: an admin, the Consultant themselves, and
other Consultants. It's invisible to every other non-admin viewer (other
doctor categories, clerks), even once approved. This is enforced at the
database level (a Postgres RLS policy on `leave_requests`), not just hidden
in the UI, so it holds regardless of which screen or API call is used to
read leave data.

The roster grid is unaffected by this — every user can still see which
Consultant is on call for a given date there, since that's roster
assignment data, not a leave request.

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

**Total days vs. annual leave days:** when submitting a request, you're
unavailable for rostering for the *whole* date range entered, but you
separately state how many of those days actually count as annual leave
(the app requires this as an explicit number at submission, since it
depends on the padding-weekend rules above and needs a human judgement
call, not something the app derives automatically). For example: a 7-day
request covering a padding weekend on either side might only be 5 annual
leave days — the other 2 don't reduce your balance, but you still need to
make up their hours elsewhere (per the 5-day rule). A 16-day request (Friday
of week 1 to Sunday of week 2) covering an "on" middle weekend might count
the full 10 core weekdays as annual leave with no makeup owed for that
middle weekend (per the 10-day rule). Every list of leave requests in the
app (My leave, Team leave, Requests, the planners) shows both numbers
when they differ, for HR-audit visibility.

**How the app enforces the capacity limit:** the sheet's "no more than one
person per slot" rule is applied to the Annual Leave grid as a hard cap per
category column, plus a combined cap across the three "full-time EC doctor"
columns together — both checked automatically when a doctor submits an
annual leave request, not just displayed after the fact:

| Column | Categories | Max concurrent |
| --- | --- | --- |
| MO | MO | 2 |
| Registrar | Registrar | 1 |
| EC COSMO / Intern | COSMO, EC_COSMO, EC_COSMO_Intern, Intern | 2 |
| OT COSMO / Intern | COSMOPsych, OT_COSMO, OT_COSMO_Intern | 1 |

**Combined cap — no more than 2 full-time EC doctors (MO + Registrar + EC
COSMO/Intern combined) on leave at once.** OT COSMO/Intern is a separate
stream with its own independent cap (1) and isn't part of this combined
cap — it's additive on top, giving an overall ceiling of **3 doctors (any
category) on leave at once.** Valid combinations of full-time EC doctors at
the 2-doctor combined cap:

1. 2 MO
2. 1 MO + 1 Registrar
3. 1 MO + 1 EC COSMO/Intern
4. 1 Registrar + 1 EC COSMO/Intern
5. 2 EC COSMO/Intern

Never more than 1 Registrar concurrently (already capped at 1 above), and
never more than 2 full-time EC doctors combined even if each individual
column is still under its own cap. The separate OT COSMO/Intern cap of 1
(this includes any COSMO/Intern Psych) then adds to whichever full-time
combination is on leave — e.g. 2 MO + 1 OT COSMO/Intern reaches the
3-doctor overall ceiling.

Consultant doctors have their own uncapped "Other" column on the grid — no
concurrency cap applies to them — but per the Consultant leave privacy rule
above, only an admin or another Consultant actually sees names in it; for
everyone else the column renders empty. These numbers are configurable in
Supabase (`constraints` table:
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
- **No more than 3 doctors (any category) may apply for Special Leave at
  the same time.** Unlike the Annual Leave capacity limits above, this is
  currently a documented guideline only — it isn't yet checked
  automatically at submission.

### Courses

- Courses taken are to be specified on the leave request. Days taken will
  count as official working hours/days.
- A formal Leave Form must be submitted and approved — courses done count as
  "Special Leave."
- Please specify what course you are doing when requesting "Special Leave
  Days," e.g.: Bottomley (ACLS).

### Single-Day-Off requests

- The requested SINGLE day off CANNOT be "tailed onto" a request made as per
  the Annual Leave Planner above.
- The requested SINGLE day off CANNOT be requested "in addition to" an
  Annual Leave request as per the Annual Leave Planner above.
- The requested SINGLE day off CAN be requested "in addition to" an "on"
  weekend-off request.
- The SINGLE day requested off can be ANY day of the week — hours will be
  made up on another (roster-beneficial) day.
- If the requested SINGLE day off is a FRIDAY, indicate if it's wanted as a
  "Post-Call" day by adding (PC) in the leave request motivation.
- If the requested FRIDAY is NOT a "Post-Call" day, the hours will be made
  up on another day.
- A SINGLE weekend day on an "on" weekend can also be requested — the
  weekend day will be worked back on another weekend during the month.

## Weekend Request Planner rules

- Weekend rotations are organised in columns by MO / Registrar / EC COSMO /
  OT COSMO, colour-coded per doctor group.
- If your name is listed in a specific colour for a given month, you work
  **every** weekend in that colour that month.
- No more than one person per slot.

### Requests for Weekend Exceptions ("weekends off")

- If you request an "on" weekend off, you will be rostered on one of your
  "off" weekends to make up your weekend hours.
- If you do not want this, then you have to put in annual leave days.
- Please indicate the number of annual leave days you wish to take when
  submitting your leave request.
- If the request is approved, it will be captured on the Leave Planner and
  Weekend Planner.
- If you do not put in leave days, this specific "off" weekend request will
  be considered **subject to rostering requirements.**

## How to request leave

1. Submit the appropriate request through the app's Leave tab (**My
   leave**) — choose the correct leave type: Annual, Sick, Family
   responsibility, Study, Special, Prenatal, Maternity, Paternity,
   Workshop, Course/CPD, Conference, Single day, or Weekend exception.
   Everything except Annual and Sick is the same "everything else"
   distinction the sheet draws between the Annual Leave Planner and the
   Special Requests Planner.
2. Indicate the number of annual leave days you will be taking, per the
   guidelines above.
3. Indicate any motivations or additional requests in the **Motivations**
   section.
4. Incorrect or misrepresented leave requests will be rejected.
5. An admin reviews and approves (or rejects) the request before it's
   confirmed — approved annual leave then appears on the Annual Leave
   planner; everything else (and anything still pending) appears on the
   Special Leave planner. Approved "Weekend Exception" requests appear on
   the Weekend Planner.
6. Populate/refer to the planner using **surnames**, matching the sheet's
   convention.
