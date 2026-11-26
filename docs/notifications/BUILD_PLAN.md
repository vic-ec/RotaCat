# Notifications: build plan

**Status:** planned, not built. Reference for the future build.
**Written:** 26 Nov 2026, from the database and code as they stood that day.

## 1. Why

Some events need someone to act, and today nobody is told about them:

- A doctor cancels their own leave.
- A doctor asks for leave.
- An admin changes someone's shift.

The app already **writes** notifications, but **nothing shows them**. As of 26 Nov 2026 there are 35 rows, and none have been read:

| Type | Rows | Unread |
|---|---|---|
| `leave_approved` | 23 | 23 |
| `leave_cancelled` | 9 | 9 |
| `leave_rejected` | 3 | 3 |

Until this is built, the Dashboard's **Needs attention** list and the roster's **"Leave cancelled — review"** note are how admins find out. They will stay: they are the to-do list. Notifications are the message that sends someone there.

## 2. What exists today

### 2.1 Table `public.notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | `uuid_generate_v4()` |
| `profile_id` | uuid | the recipient |
| `type` | `notification_type` enum | see 2.2 |
| `title` | text | |
| `body` | text | |
| `read` | boolean | default false |
| `link` | text, nullable | an in-app path, for example `/leave?tab=team` |
| `created_at` | timestamptz | `now()` |

**RLS policies:**

| Policy | Rule |
|---|---|
| `notif_select_own` | `profile_id = auth.uid()` |
| `notif_update_own` | `profile_id = auth.uid()` |
| `notif_insert` | `is_admin() OR profile_id = auth.uid()` |

There is no delete policy.

### 2.2 Enum `notification_type`

`roster_published, leave_approved, leave_rejected, swap_request, swap_accepted, swap_rejected, swap_admin_approved, shift_claimed, account_approved, account_rejected, ph_lieu_updated, reminder, general, shift_cancelled, leave_cancelled`

### 2.3 Writers

| Where | Type | Recipient |
|---|---|---|
| `src/lib/leaveApprovals.js` (approve) | `leave_approved` | the doctor |
| `src/lib/leaveApprovals.js` (reject) | `leave_rejected` | the doctor |
| `src/lib/leaveRequests.js` (admin captures leave) | `leave_approved` ("Leave captured on your behalf") | the doctor |
| `src/lib/usePendingApprovalReview.js` | `account_rejected` | the applicant |
| `cancel_leave_request()` SQL function (`supabase/migrations/20261115130100_cancel_leave_request.sql`), admin cancels | `leave_cancelled` | the doctor |
| `cancel_leave_request()`, doctor cancels their own | `leave_cancelled` | every active admin except the caller |

All client-side writes go through `src/lib/notifications.js` (`createNotification`).

### 2.4 Preferences

- `profiles.notification_prefs` (jsonb): `{ [type]: boolean }`.
- Edited in Account → Notifications (`AccountSettingsPage.jsx`). It has group toggles (Roster, Leave, Swaps, Open shifts, Account, Reminders & general) and per-type toggles under Advanced.
- **No writer reads these preferences yet.**

### 2.5 Email

- Edge Functions already send email over Gmail SMTP (`supabase/functions/_shared/email.ts`: `GMAIL_SMTP_USER` / `GMAIL_SMTP_PASS`, shared `renderEmail` template).
- `account-status-email` is called by a database webhook guarded by `ACCOUNT_STATUS_EMAIL_SECRET`. It is the pattern to copy.

## 3. What to build

### 3.1 In-app bell

- **Where:**
  - Desktop: in the sidebar header, next to the user's name.
  - Phone: top right of the page header.
  - Both show a red unread count, capped at "9+".
- **Panel:** desktop uses the app's `.popup` style anchored to the bell. Phone uses an `ActionSheet`.
  - Newest first.
  - Each row: title, body (two lines), time ago, unread dot.
  - Tapping a row marks it read and opens `link`.
  - "Mark all as read" at the top.
  - "Settings" opens Account → Notifications.
- **Live count:** reload on focus and once a minute, using `useLiveRefresh` (as the Dashboard does). Supabase Realtime on `notifications` filtered by `profile_id` is optional, later.
- **Offline (PWA):** the list is a Supabase REST read, so the `NetworkFirst` cache serves the last copy. Mark-as-read needs a connection; disable it offline.

### 3.2 Events

**Existing** = a row is already written today; only display and email are new.

| # | Event | Recipient | Type | Link | Email by default | Status |
|---|---|---|---|---|---|---|
| 1 | Leave approved | doctor | `leave_approved` | My leave | yes | existing |
| 2 | Leave rejected | doctor | `leave_rejected` | My Requests | yes | existing |
| 3 | Leave captured on your behalf | doctor | `leave_approved` | My leave | yes | existing |
| 4 | Admin cancelled your leave | doctor | `leave_cancelled` | My leave | yes | existing |
| 5 | **Doctor cancelled their own leave** | admins | `leave_cancelled` | the roster day with "Leave cancelled — review" if a roster shift was affected, otherwise Team Leave | yes | existing row; link to change |
| 6 | New leave request waiting | admins | new `leave_requested` | Requests | daily digest | new |
| 7 | Roster published | every doctor on it | `roster_published` | the roster, on their first shift | yes | new |
| 8 | **Your shift changed** on a published roster (removed, covered, swapped, moved, new times) | the doctor(s) affected | new `roster_changed` | the roster day, marked | yes | new |
| 9 | You were put on a shift as cover | the covering doctor | `roster_changed` | the roster day, marked | yes | new |
| 10 | Account request waiting | admins | `general` (or new `account_requested`) | Staff → Requests | yes | new |
| 11 | Account approved / rejected | applicant | `account_approved` / `account_rejected` | — | already emailed by `account-status-email` | in-app row new for approved |
| 12 | Open shift claimed / cancelled (locum marketplace) | admins / locum | `shift_claimed` / `shift_cancelled` | the roster day | yes | with the marketplace build |
| 13 | Swap request flow | both doctors, then admins | `swap_*` | Swaps | yes | with the swap build |
| 14 | Days in lieu changed | doctor | `ph_lieu_updated` | My year | no | later |

Rules:

- **Never notify the person who did it.** `cancel_leave_request` already skips the caller.
- **Draft rosters notify nobody.** Edits to a draft are not news until it is published.
- **One message per action.** A batch edit (one `roster_entry_changes.batch_id`) sends one notification per affected person, not one per row.
- **Plain words.** Example: "Your 22h00 shift on Mon 23 Nov was covered by Dr Alli", not codes like `WD_22`.

### 3.3 Email

- **Function:** a new Edge Function `notification-email`, called by a database webhook on `INSERT` into `notifications`. It follows the `account-status-email` pattern: a shared secret, the service role, `renderEmail`, and Gmail SMTP.
- **Before sending, it checks:**
  - the recipient's preference for that type (3.4)
  - that the recipient is active and has an email
  - a per-recipient rate limit (at most 1 email per type per 10 minutes, the rest folded into the next)
- **Digest:** the `leave_requested` digest is a scheduled job, once a day at 07:00 SAST, listing pending requests. It is not per event.
- **Content:** each email carries the same title, body and a button to `APP_URL + link`.

### 3.4 Preferences

Change `notification_prefs` from `{ type: boolean }` to `{ type: { app: boolean, email: boolean } }`:

- **Reading old values:** read `true`/`false` as `{ app: true, email: <value> }`, so nobody's saved choice is lost.
- **In-app:** always written. `app: false` only hides that type from the bell.
- **Account → Notifications:** gets an "In app" and an "Email" column per group.
- **Defaults:** the "Email by default" column in 3.2.

## 4. Database changes

All in one migration:

- `alter type notification_type add value 'leave_requested'`
- `alter type notification_type add value 'roster_changed'`
- optionally, `alter type notification_type add value 'account_requested'`
- `alter table notifications add column read_at timestamptz`, set when `read` turns true
- `create index on notifications (profile_id, read, created_at desc)`
- A `security definer` function `notify(p_profile_id, p_type, p_title, p_body, p_link)`:
  - It becomes the one way to write a notification, from both SQL and the client.
  - It lets a doctor's action, such as cancelling their own leave or asking for leave, notify admins without opening the insert policy to everyone.
  - `createNotification` calls it.
- Retention: a scheduled job deletes read notifications older than 90 days, and unread ones older than 180 days.

## 5. Build phases

| Phase | Scope | Notes |
|---|---|---|
| 1 | Bell, panel, unread count, mark read, mark all read | Shows the 35 rows already written. Front end only, plus the index. |
| 2 | Missing events: 5's link, 6, 7, 8, 9, 10 | `notify()` function. Roster-change messages from the roster edit save (`rosterEdits.js`, by `batch_id`), published rosters only. |
| 3 | Email: `notification-email` function, webhook, digest, preference columns | Needs the SMTP secrets already set for `account-status-email`. |
| 4 | Optional: phone push (PWA web push) | Needs a VAPID key pair and a `push_subscriptions` table. iOS only in an installed PWA (16.4+). |

## 6. Tests

- **Unit:**
  - message wording per event (a pure `notificationText(event)` module)
  - reading old and new preference shapes
  - batch-to-recipients grouping
- **Component:** the bell (count, "9+", empty state, mark read, link), with `src/lib/supabase` mocked as elsewhere.
- **SQL:** run `notify()` and the cancel / leave-request paths against a branch database. Check that the caller is never notified and RLS still limits reads to the recipient.

## 7. Open questions

1. Should doctors get an email for every change to their shift on a published roster, or a daily summary?
2. Leave requests for admins: an instant email per request, or the 07:00 digest only?
3. Should clerks receive anything?
4. Should a notification about cancelled leave clear itself once the admin has reviewed that shift on the roster?
