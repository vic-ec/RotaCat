# admin-staff-credentials

Service-role Edge Function behind the Staff list's **Add staff** form and its
per-row **Regenerate password** action. It is the only place in the system
that can create an auth user or set someone else's password, which is why
both actions live here rather than in the frontend.

```
POST { action: 'create',     ...form fields }  → new confirmed auth user + filled-in profile
POST { action: 'regenerate', profileId }       → fresh password for an existing account
```

Every request is authenticated (`verify_jwt` is on) **and** checked against
`profiles.is_admin` — a valid JWT only proves "some signed-in account",
which is not enough to mint credentials.

## Deploying

Deployed from this directory's four files (`index.ts`, `password.ts`,
`email.ts`, `defaults.ts`) as a single function. `defaults.ts` is a
hand-maintained mirror of `src/lib/staffDefaults.js`; `defaults.test.ts`
fails if the two drift, and `password.test.ts` asserts the generator
satisfies the Supabase Auth password policy on every run. Both run under
the repo's normal `npm test`.

## Secrets

Set as Edge Function secrets on the Supabase project (Project Settings →
Edge Functions → Secrets). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are injected by the platform and need no configuration.

| Name | Required | Default | Notes |
| --- | --- | --- | --- |
| `SMTP_USER` | yes | — | Gmail relay account. Without it the account is still created; the email step reports as failed and the admin is shown the password to relay by hand. |
| `SMTP_PASS` | yes | — | Gmail app password, not the account password. |
| `SMTP_HOST` | no | `smtp.gmail.com` | |
| `SMTP_PORT` | no | `465` | Implicit TLS on 465; any other port is sent as STARTTLS. |
| `SMTP_FROM` | no | `SMTP_USER` | |
| `SMTP_FROM_NAME` | no | `RotaCat` | Display name on the welcome email. |
| `APP_URL` | no | the calling admin's `Origin` | Login link in the email. Set this if admins ever use the app from an origin you don't want emailed out (a preview deployment, localhost). |

## The generated password

Generated per request from `crypto.getRandomValues`, held in memory only
long enough to reach `createUser`/`updateUserById` and the email body, and
returned to the browser **only** when the email failed to send, so the
admin has some way to hand it over. It is never logged and never written to
any table. Keep it that way if you edit this function.
