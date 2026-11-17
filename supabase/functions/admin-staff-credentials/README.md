# admin-staff-credentials

Service-role Edge Function behind the Staff list's **Add staff** form, the
**Regenerate password** action (Staff list row menu and the Account page),
and the super-admin's **change email** on someone else's Account page. It
is the only place in the system that can create an auth user or set someone
else's password or login email, which is why these actions live here rather
than in the frontend.

```
POST { action: 'create',     ...form fields }  → new confirmed auth user + filled-in profile
POST { action: 'regenerate', profileId }       → fresh password for an existing account
POST { action: 'change_email', profileId, email, sendCredentials }
                                               → new login email; optionally a fresh password sent to it
POST { action: 'delete',     profileId }       → remove the auth user; the profile cascades
```

| Action | Who may call it |
| --- | --- |
| `create`, `regenerate`, `delete` | `profiles.is_admin` |
| `change_email` | `profiles.is_super_admin` only (403 otherwise) |

`regenerate` issues a temporary password, valid for 14 days
(`TEMP_PASSWORD_VALIDITY_DAYS` in `src/lib/tempPassword.js`, counted from
`profiles.temp_password_issued_at`). It can be repeated as often as needed;
each run invalidates the previous password and restarts the window. An
account that has never signed in gets the "Welcome to RotaCat" email;
one that has gets "Your new RotaCat password".

`change_email` replaces another person's login email through the Auth admin
API (`updateUserById` with `email_confirm: true` — never SQL against
`auth.users`). It takes effect immediately and sends **no** confirmation
email to either address; `profiles.email_verified` is set to true. It is
refused for the caller's own account (that stays on the self-service
confirmation-link flow), for an address already in use, and for an
unchanged address. With `sendCredentials: true` it then runs the same
password path as `regenerate`, so the temporary password goes to the new
address; with `false` the password, `must_change_password` and
`temp_password_issued_at` are untouched. It responds with
`{ ok, profileId, email, credentialsIssued, emailSent?, emailError?, password?, credentialsError? }`.
If the email changed but the password could not be issued, the change is
not rolled back: the response is `ok: true`, `credentialsIssued: false`
with a `credentialsError` message. Email changes are not written to any
audit table (only a function log line with the two profile ids). Existing
sessions on the account are not signed out by the change.

`delete` is refused for the caller's own account, for admins, and for anyone
who already appears on a roster or weekend plan (those rows are history and
do not cascade — deactivate the account instead). It clears the handful of
non-history references first (change requests, leave balances, staff
reference row, `approved_by` on other profiles), then deletes the auth
user; `profiles.id` cascades from `auth.users`, and the person's own leave,
rotations, weekend patterns, notifications and stats cascade from there.
After a successful delete it writes one row to `account_deletion_log`
(name, surname, email, role, category, who deleted them, when) — the only
record of the account that survives, shown to admins under Staff list →
All Staff → "Recently deleted accounts". The table has no client-side
write policy; this function is the only writer.

`create` takes `rotations` as an array of `{ rotationType, subtype, startDate,
endDate }`, so an Intern's or Registrar's whole year can be planned at
creation rather than just an opening block. Blocks with no `startDate` are
dropped; overlapping blocks are rejected, since `rotationForDate` resolves a
date by taking the first match and would otherwise silently pick a winner.
All the blocks go in as one insert, so a partial year is never left behind.

Every request is authenticated (`verify_jwt` is on) **and** checked against
`profiles.is_admin` — a valid JWT only proves "some signed-in account",
which is not enough to mint credentials.

## Deploying

There is no automatic deploy: after merging a change here, run
`supabase functions deploy admin-staff-credentials` from the repo root.

Deployed from this directory's five files (`index.ts`, `password.ts`,
`email.ts`, `defaults.ts`, `changeEmail.ts`) plus `../_shared/email.ts`, which holds the
layout, palette, dark-mode treatment and SMTP transport every RotaCat email
shares (also used by `account-status-email`, and by
`scripts/email-templates.mjs` to generate the Supabase Auth templates in
`supabase/templates/`). Deploy with the Supabase CLI from the repo root so
the `_shared` import resolves. `defaults.ts` is a
hand-maintained mirror of `src/lib/staffDefaults.js`; `defaults.test.ts`
fails if the two drift, and `password.test.ts` asserts the generator
satisfies the Supabase Auth password policy on every run.
`changeEmail.ts` holds the pure checks behind `change_email` (permission,
own-account refusal, validation, welcome-vs-reset choice) so
`changeEmail.test.ts` can cover them. All three run under the repo's
normal `npm test`.

## Secrets

Set as Edge Function secrets on the Supabase project (Project Settings →
Edge Functions → Secrets). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are injected by the platform and need no configuration.

| Name | Required | Default | Notes |
| --- | --- | --- | --- |
| `GMAIL_SMTP_USER` | yes | — | Gmail relay account — the same address as the Supabase Auth SMTP settings. Without it the account is still created; the email step reports as failed and the admin is shown the password to relay by hand. |
| `GMAIL_SMTP_PASS` | yes | — | Gmail **app password** (16 characters, from myaccount.google.com/apppasswords), not the account password. |
| `GMAIL_SMTP_HOST` | no | `smtp.gmail.com` | |
| `GMAIL_SMTP_PORT` | no | `465` | Implicit TLS on 465; any other port is sent as STARTTLS. |
| `GMAIL_SMTP_FROM` | no | `GMAIL_SMTP_USER` | |
| `GMAIL_SMTP_FROM_NAME` | no | `RotaCat` | Display name on the welcome email. |
| `APP_URL` | no | the calling admin's `Origin` | Login link in the email. Set this if admins ever use the app from an origin you don't want emailed out (a preview deployment, localhost). |

## The generated password

Generated per request from `crypto.getRandomValues`, held in memory only
long enough to reach `createUser`/`updateUserById` and the email body, and
returned to the browser **only** when the email failed to send, so the
admin has some way to hand it over. It is never logged and never written to
any table. Keep it that way if you edit this function.
