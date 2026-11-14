# account-status-email

Sends the "Your account has been approved" and "Your registration was not
approved" emails. It is called by the database, not by the app: the trigger
in `supabase/migrations/20261114130000_account_status_email_trigger.sql`
fires when an administrator's decision flips `profiles.is_approved` or
`profiles.is_rejected` to true, and POSTs here through `pg_net`.

```
POST { event: 'approved' | 'rejected', profile_id }   header: x-rotacat-webhook-secret
```

The function reads everything else (name, email address, future start date,
the admin's note) from the database, re-checks that the row really is in the
state the event claims, and sends over the same Gmail relay as the welcome
email. Layout and transport are shared from `../_shared/email.ts`.

## One-time setup

1. **Deploy without JWT verification** — the database has no user session:

   ```bash
   supabase functions deploy account-status-email --no-verify-jwt
   ```

2. **Pick a secret.** Any long random string, e.g. from
   `openssl rand -hex 32`. It is what stops anyone else calling the function.

3. **Function secrets** (Project Settings → Edge Functions → Secrets):

   | Name | Required | Notes |
   | --- | --- | --- |
   | `ACCOUNT_STATUS_EMAIL_SECRET` | yes | The secret from step 2. |
   | `GMAIL_SMTP_USER` / `GMAIL_SMTP_PASS` | yes | Same values as admin-staff-credentials. Secrets are per project, so if those are already set they apply here too. |
   | `GMAIL_SMTP_HOST` / `PORT` / `FROM` / `FROM_NAME` | no | As for admin-staff-credentials. |
   | `APP_URL` | recommended | The production URL, for the Sign in button. There is no browser Origin to fall back on here, so without it the button is omitted. |

4. **Vault secrets**, so the trigger knows where to call (SQL editor, once):

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/account-status-email', 'account_status_email_url');
   select vault.create_secret('<the secret from step 2>', 'account_status_email_secret');
   ```

5. Apply the migration (`supabase db push`, or run the file in the SQL editor).

Until step 4 is done the trigger logs a warning and sends nothing; approvals
and rejections still go through exactly as before.

## Checking it works

Approve a test registration, then look at **Edge Functions → account-status-email
→ Logs** for `sent approved email to …`. A `401` there means the Vault secret and
the function secret differ; a `409` means the row was not in the state the event
claimed (usually a replay).
