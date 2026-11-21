# Locum Shift Marketplace: addendum to the design spec

**Applies to:** "RotaCat — Locum Shift Marketplace: Design Spec" (10 Nov 2026).
**Written:** 21 Nov 2026, after the leave-capture, roster-vacancy and locum-cover work landed.

The spec was checked against the repo and database as they stood on 10 November. Work since then built part of what it describes, changed some of what it assumes, and settled a few conventions. Read this alongside the spec; where the two disagree, this document wins.

Section numbers below are the spec's own.

## 1. What changed underneath the spec

| Area | Where | What now exists |
|---|---|---|
| Admin leave capture | `submitLeaveRequest` (`capturedBy`), `LeaveRequestForm` | An admin files leave for any doctor: approved on the spot, `leave_requests.submitted_by` records who. |
| Removal dialog | `RosterVacancyModal`, `resolveVacancy` in `src/lib/rosterVacancy.js` | One form, one save: a reason (sick leave, other leave, swap, no-show, other) and what happens to the shift. A leave reason captures the leave in the same save. |
| Who came off a shift | `roster_entries.vacated_*`, `roster_entry_changes.reason` / `note` / `leave_request_id` | The original doctor stays on the row and shows struck through on the grid. |
| Leave on the roster | `approved_leave_ranges()` RPC, `src/lib/approvedLeave.js` | Who is on approved leave, without the type, for every viewer. |
| Locum cover from the roster | `src/lib/locumCover.js`, `DoctorDropdown`, `NewLocumModal` | The picker lists locums and offers "New locum". |
| Locums with no account | `locum_contacts` table, `roster_entries.locum_contact_id`, `LocumContactsPanel` | Name and mobile only; admin-only. See section 3. |
| Dashboard | `src/lib/useLiveRefresh.js` | Every dashboard reloads quietly on focus and once a minute. |

## 2. Corrections to the spec

### 2.1 How a locum shift is stored (spec section 5, "Roster entry on confirm")

The spec says a confirmed locum with an account is written with `is_locum = false` and `locum_name = null`. **Do not do this.** Every locum shift in the live data, and everything built since, uses one convention:

| Slot | `is_locum` | `locum_name` | `profile_id` | `locum_contact_id` | `counts_toward_contract_hours` |
|---|---|---|---|---|---|
| Open, nobody on it | true | `[ ]` | null | null | unchanged |
| Locum with an account | true | `[Surname]` | the locum | null | false |
| Locum with no account | true | `[Surname]` | null | the contact | false |

- `[ ]` means open. `[Surname]` means filled. This is the rule for every locum slot.
- `coverPatch`, `OPEN_SLOT_PATCH`, `locumLabel`, `isOpenLocumSlot` and `locumDisplayName` in `src/lib/locumCover.js` implement it. `confirm_shift_application` and `assign_locum_to_shift` must write the same values.
- A doctor working a locum shift keeps `is_locum = true` with their own profile; leave those rows alone.

### 2.2 One kind of open slot (spec section 4)

The spec's "open slot" is the generator's unfilled locum slot. Opening a shift through the removal dialog now produces exactly the same thing (`OPEN_SLOT_PATCH`), with the original doctor kept in `vacated_profile_id`. So:

- "Not advertised" in the Locum cover view is every entry where `isOpenLocumSlot` is true and no open advert exists. No second case to handle.
- `resolve_shift_cancellation` returning an entry "to placeholder" means applying `OPEN_SLOT_PATCH`.

### 2.3 The word "placeholder"

In the spec, a placeholder is an open slot. It never means a person. People without an account are **locum contacts** (`locum_contacts`). Keep the two words apart in code and in the interface.

### 2.4 "Open & advertise" (spec Phase 1, step 3)

`RosterVacancyModal.handleOpenAdvertise` no longer exists. The advert insert is in `resolveVacancy` (`cover === 'advertise'`). Replace that insert with the `advertise_shifts` call; once the advert columns in section 5 exist, the current direct insert will no longer be valid.

### 2.5 Stale audit figures (spec section 2)

Re-run the audit, as Phase 1 step 1 already says. Known to have changed: the number of approved locum accounts and of shifts assigned to them is far higher, `shift_advertisements` is no longer empty, and `pg_net` is installed.

### 2.6 Notifications are still unread (spec section 2, "Gaps found")

Still true. Leave captured on a doctor's behalf writes a `leave_approved` row that nothing displays. Phase 5 should decide whether that type joins the email allow-list.

## 3. Locum contacts: additions to the spec

The spec lets an admin "type a name for a locum without an account". That is now a record, not free text.

**Adding one.** "New locum" in the roster picker takes first name, surname and mobile. Without an email it saves a `locum_contacts` row and assigns the shift at once. With an email it creates the account through `admin-staff-credentials`, as "Add staff" does.

**Getting them an account.** Three routes, all of which end in `linkLocumContact`, which moves every shift under the contact onto the account:

| Route | Where | How |
|---|---|---|
| They register themselves | Pending-approval review | Their mobile is matched against open contacts (`findByPhone`: last nine digits). The review shows the match with a ticked "same person" box; approving links. Only for a locum registration. |
| Admin creates it | Staff page panel, "Create account" | "Add staff", prefilled. |
| They already have one | Staff page panel, "Link to account" | Pick the account; one with the same mobile is suggested. |

**Inviting them.** "Invite on WhatsApp" on the Staff panel opens WhatsApp on the admin's phone with a ready message and the sign-up link, asking the locum to register with the same mobile number. Nothing is sent by the app. This is the same mechanism as the spec's "Share to WhatsApp" and shares its helper (`phoneWhatsAppMessageHref`).

**For the marketplace build:**

- `assign_locum_to_shift(entry_or_ad, profile_id or name, ...)` gains a third form: a `locum_contacts` id. A bare typed name with no contact row should no longer be offered.
- The block list (`locum_admin.is_blocked`) must also filter the roster picker's Locums section and "Link to account", not only the marketplace.
- A contact cannot receive email or see `/shifts`. Advert notifications skip them; the WhatsApp share is the only way to reach them.
- The Locums section of the hours summary (spec section 5, "Hours") groups a contact's shifts by `locum_contact_id`, not by the printed label, since two locums can share a surname.

## 4. Other additions

| Spec section | Addition |
|---|---|
| 5, `shift_advertisements` | Carry the vacancy reason onto the advert (`roster_entries.vacated_reason`), so Locum cover can show "sick cover" on the card. Coarse values only: `leave`, `swap`, `no_show`, `other`. Never the leave type. |
| 5, Hours | `entryHours` must keep the rule already in `rosterSummary.js` and `monthlyHours.js`: a shift a doctor still holds over approved leave counts for nothing (`isEntryOnLeave`). |
| 6, Cancellation | When a confirmed locum is released, set `vacated_*` on the entry as the removal dialog does, so the grid shows the released locum struck through above the reopened slot. Use `vacated_reason = 'other'`. |
| 6, Roster grid | On a published roster, tapping a locum's shift currently opens the plain picker (a locum has no leave to capture). The advert panel and "Edit times" replace that. |
| 6 and 7, Dashboard cards | They need no refresh logic of their own; `useLiveRefresh` already reloads the dashboard. |
| 9, Access | `locum_contacts` is admin-only by RLS and holds a mobile number. No locum-facing query may read it. |
| 10, Ground rules | "No real staff names in test fixtures" also covers examples in comments and docs. |

## 5. Open questions

- Should a locum contact's mobile number be checked for duplicates when it is added (the same person added twice from two shifts)?
- When a contact is linked, should their past shifts be re-labelled if the account's surname differs from the one typed?
- The spec's two open questions (telling a locum when worked times change; showing rates) are unchanged.
