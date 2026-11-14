# Supabase Auth email templates

The three emails Supabase Auth sends on the app's behalf, in the same layout
as the two the `admin-staff-credentials` function sends itself. Every RotaCat
email therefore shares one header (the Rota/Cat wordmark and tagline), one
palette (the app's light tokens, swapping to the dark theme's under
`prefers-color-scheme: dark`) and one footer.

**Do not edit these files by hand.** They are generated from the layout in
`supabase/functions/admin-staff-credentials/email.ts` by:

```bash
node scripts/email-templates.mjs
```

Add `--previews` to also refresh the light/dark screenshots of all five emails
in `docs/email-templates/` (needs Playwright on the machine).

## Installing them

Supabase does not read these from the repo. After regenerating, paste each
file's full contents into the matching template in the dashboard
(**Authentication → Email Templates**), and set the subject line there too:

| File | Dashboard template | Subject | Triggered by |
| --- | --- | --- | --- |
| `confirm-signup.html` | Confirm sign up | `Your RotaCat confirmation code` | Create account (`signUp`) and "Resend code" |
| `reset-password.html` | Reset password | `Reset your RotaCat password` | Forgot password on `/login` |
| `change-email.html` | Change email address | `Confirm your new RotaCat email address` | Account settings → change email |

The remaining dashboard templates (Magic link, Invite user, Reauthentication)
are not used by the app and are left at Supabase's defaults.

## Things the copy assumes

- **Confirm sign up** uses `{{ .Token }}`, the 6-digit code the app's
  confirmation screen asks for. It says the code lasts one hour; that is the
  project's default OTP expiry (Authentication → Providers → Email → "Email
  OTP expiration"). Change the sentence if that setting changes.
- **Change email** tells the reader confirmation is needed from *both* the old
  and the new inbox. That is true while "Secure email change" is on in the
  dashboard (the default, and what the app's own success message says). If it
  is ever turned off, only the new address receives the email and this copy
  overstates the process.
- **Reset password** uses `{{ .ConfirmationURL }}`, which already carries the
  `redirect_to` the app passes (`/reset-password`).

## Dark mode

The templates opt in with `color-scheme: light dark` and repaint every colour
under a `prefers-color-scheme: dark` media query, with `[data-ogsc]`/
`[data-ogsb]` twins for Outlook. Clients that honour that (Apple Mail and iOS
Mail, Outlook for Mac/iOS/Android and Outlook.com, Samsung Mail, Thunderbird)
show the app's night palette: near-black ground, dark card, mint "Cat".

Gmail (web, iOS and Android) ignores author dark-mode styles. In its dark
theme it applies its own partial inversion to the light palette instead, so
the result there is Gmail's colours, not the app's. The light palette is what
it inverts from, which is the readable case.
