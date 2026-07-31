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

10. **Dedicated desktop planner workspace** — for admins doing heavy
    roster/leave editing on a desktop screen: sticky toolbar (planner
    switcher, month/year, search, filter, legend), sticky first
    column/header row so names stay visible while scrolling, a resizable
    split view (planner left, selected-day inspector right) instead of a
    modal, and filterable layers (approved/pending/capacity
    warnings/public holidays/weekend rotation). A bigger, separate rebuild
    from the mobile-first Leave planner work — not attempted alongside it.

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

12. **Annual leave HR-audit report** — a dedicated admin view totalling
    total-vs-annual leave days per doctor per year, rather than only
    showing the per-request breakdown wherever a request is listed (My
    leave, Team leave, Requests, the planners). The per-request data
    (`annual_leave_days`) already exists as the input this would need.
