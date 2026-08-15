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

10. **Black list locums** — build a function to black list locums. When
   activated,locums able to log in but not see available shifts or make
   shift requests.