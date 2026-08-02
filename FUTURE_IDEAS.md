# Future Ideas

A running backlog of feature ideas for RotaCat, not yet scoped or scheduled.
Add new ideas as they come up; when there's time, pull one into an actual
build phase (see `README.md`).

1. **Calendar export** — let users export their shifts to an external
   calendar app (Google Calendar, Outlook, etc.) instead of only viewing
   them in RotaCat.

2. **Live dashboard landing page** — replace the placeholder dashboard with
   a time/date-aware view showing: the current date and time as a header;
   the signed-in user's upcoming shifts; who's on shift now and who's up
   next (updates as the day progresses); who's currently on leave; and
   quick links to Request Leave, Request Shift Swap, and Send Message.

3. **Push notifications** — investigate feasibility, especially for iOS
   PWAs, which historically have more limited/involved push support than
   Android or native apps.

4. **Quick contact from the roster grid** — let an admin click a name on
   the roster and message/call them directly, reusing the quick-action
   menu already built for the Staff list.

5. **Advertise open shifts** — let admins broadcast unfilled roster shifts
   to active staff and locums. Delivery mechanism is still undecided —
   per-user notification, email, push, or a dedicated in-app messaging
   system — and needs a decision before this can be designed. From the
   draft roster specifically: flag unfilled slots and advertise them to the
   locum pool — open question on notification channel (in-app, push,
   WhatsApp?).

6. **First time login** - Account setup should be the landing page for new
   users signing in for the first time.

7. **Locum timesheets** — let locums submit timesheets through the app,
   scoped to their agency. Once an admin approves the hours, an
   electronically signed timesheet is emailed to the agency (locum CC'd),
   with the app retaining both the document and a transmission record.

8. **Roster/OT translator** — build in (or link to) a roster translator so
   users can process overtime.

9. **Auto-generated leave paperwork (Z1(a))** — on leave request approval,
   autofill and send an electronically signed Z1(a) to the requesting
   user, with the app retaining both the document and a transmission
   record. Needs a decision on PDF generation (in-app generator vs. an
   external service) and file delivery/download.

10. ~~Dedicated desktop planner workspace~~ — done for the Weekend Planner:
    `WeekendPlannerView.jsx` now has a real `lg:` desktop layout instead of
    the mobile cards just laid out wider — sticky toolbar (month/year,
    surname search, filter chips, a parity/needs-planning legend), a sticky
    header row + first column on the grid, and a split view (scannable
    read-only grid on the left, a `WeekendInspector` panel on the right
    where all add/remove editing now happens) instead of a modal. Clicking
    a grid row selects it and updates the inspector without losing scroll
    position. Deliberately not built: a drag-resizable split (fixed two-pane
    instead), a multi-month/quarter grid (still one month at a time, same as
    mobile), undo/redo, publish/export, and a full
    approved/pending/capacity-warnings/public-holidays filter set — the
    existing My Schedule/My Requests/All/Needs planning chips cover this
    planner's actual filterable concepts, several of the originally-listed
    ones (capacity warnings, public holidays) don't map to anything in its
    data model. Not extended to the Annual/Special leave planners.

11. **Annual leave affecting contracted-hours targets** — `annual_leave_days`
    (the requester-entered count of days that reduce the 22-day balance) is
    captured and displayed, but nothing in this repo currently reduces a
    doctor's *contracted monthly hours target* to account for approved
    leave — `monthlyHours.js`/`leaveApprovals.js` only warn when
    already-rostered hours exceed a fixed ceiling, they don't compute an
    adjusted target. The actual "how many hours does this doctor need to
    work this month" decision happens in the scheduler backend (a separate
    repo) during roster generation, so this needs coordination there, not
    just a frontend change.

12. ~~Annual leave HR-audit report~~ — done: Planners > Audit
    (`LeaveAuditReport.jsx`, admin-only) shows cumulative annual/special/sick
    leave per doctor over any admin-chosen date range, filterable by
    category and drillable to one doctor's individual requests.

13. **Apply the Annual planner's Overview + Month workspace + Requests
    template to Special Leave** — the Annual Leave tab now has a genuine
    year-overview → single-month-workspace flow (`AnnualPlannerOverview.jsx`
    → `MonthWorkspace.jsx`) plus a redesigned Requests queue
    (`LeaveApprovalQueue.jsx`), while the Special Leave tab
    (`SpecialLeavePlanner.jsx`) still shows the older day-row spreadsheet
    (`LeaveYearGrid.jsx`). The pieces below are already built generically
    enough to reuse rather than rebuild when Special Leave gets the same
    treatment:
    - Public-holiday highlighting (`bg-ink/10` + `ring-1 ring-ink-muted`,
      used in both `AnnualPlannerOverview.jsx`'s year-grid cells and
      `MonthWorkspace.jsx`'s day cells) and the matching legend entry — not
      annual-leave-specific, drop straight in.
    - `formatRequestDateRange` (`leaveRequests.js`) — the
      "DDD dd MMM YYYY to DDD dd MMM YYYY" + weekend/Saturday/Sunday/PH
      summary line — leave-type-agnostic already.
    - `approveLeaveRequest`/`rejectLeaveRequest` (`leaveApprovals.js`) —
      already shared between `LeaveApprovalQueue.jsx` and
      `MonthWorkspace.jsx`'s inline actions, and already type-agnostic (the
      Requests queue lists every pending leave type, not just annual).
    - The Requests queue's row layout (icon Approve/Reject/View-Calendar
      actions, back link, narrow centred width) is entirely leave-type
      generic already — no changes needed there for Special Leave to
      benefit, since it's the same single "Requests" tab both planners
      share (see `LeavePlannerPage.jsx`'s `plannerTabs`).
    - What Special Leave actually needs built fresh: its own
      `MonthWorkspace`-equivalent per-day review/approve modal (today's
      "View Calendar" action from a non-annual request just lands on the
      Special tab generally — see `openInCalendar` in
      `LeaveApprovalQueue.jsx` — since there's no per-day modal to deep-link
      into yet), and a year-overview replacing `LeaveYearGrid.jsx`'s
      spreadsheet. `MonthWorkspace.jsx`'s capacity-column machinery
      (`dayCapacitySummary`, `checkApprovalCapacityImpact`) is
      annual-leave-specific (the concurrency cap only applies to annual
      leave) and would need to be dropped or reworked, not reused as-is —
      Special Leave's day cells would show pending/approved status only, no
      "at capacity" concept.

14. **Leave area nav restructure (Overview + standalone Requests inbox)** —
    a UX review of the Weekend Planner (whose highest-value points were
    acted on: month-at-a-time view, Next weekend summary, needs-planning
    filter, denser cards) also suggested a bigger navigation change not
    attempted alongside it: rename the Planners sub-tabs to
    Overview/Annual/Special/Weekends, move filters like "My rotation"/
    "Needs planning" inside each planner instead of being separate tabs
    (Weekends now does this), and pull Requests out into its own inbox
    button with a pending-count badge rather than sitting as a sub-tab
    alongside the planner types — the review's point being that "planner
    type" and "user task" shouldn't compete at the same navigation level.
    Bigger than a single round given how much of `LeavePlannerPage.jsx`
    and `LeaveApprovalQueue.jsx` it would touch.
