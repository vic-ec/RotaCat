#!/usr/bin/env node
// Generates the Supabase Auth email templates — and, with --previews, a
// light + dark screenshot of every email RotaCat sends — from the one
// layout in supabase/functions/_shared/email.ts.
//
//   node scripts/email-templates.mjs             # rewrite supabase/templates/*.html
//   node scripts/email-templates.mjs --previews  # …and docs/email-templates/*.png
//
// The templates are committed outputs, not hand-edited files: change the
// layout in email.ts, run this, and paste each file into the Supabase
// dashboard (Authentication → Email Templates). See supabase/templates/
// README.md for the subject lines and which template goes where.
//
// Node 22.18+ strips the types from email.ts natively; nothing above its
// `smtpConfig` touches a Deno global, which is what lets this import it.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  renderEmail, panelLabel, panelValue, panelCode, adminLink,
} from '../supabase/functions/_shared/email.ts'
import { buildHtml } from '../supabase/functions/admin-staff-credentials/email.ts'
import { buildApprovedHtml, buildRejectedHtml } from '../supabase/functions/account-status-email/email.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatesDir = resolve(root, 'supabase/templates')
const previewsDir = resolve(root, 'docs/email-templates')

// ── The three Auth templates ────────────────────────────────────────────
// Go-template placeholders go through verbatim; Supabase fills them when
// it sends. {{ .Token }} is the 6-digit code the app's ConfirmEmailForm
// asks for; {{ .ConfirmationURL }} already carries the redirect_to the
// app passed (reset lands on /reset-password).
// Both sign-up paths store the first name in auth user metadata (the app's
// signUp passes `name`; admin-staff-credentials sets user_metadata.name), so
// the Auth templates can greet by name. The Go conditional falls back to a
// plain "Hi there," for any account that somehow lacks one.
const GREETING = '{{ if .Data.name }}Hi {{ .Data.name }},{{ else }}Hi there,{{ end }}'

const authTemplates = {
  'confirm-signup': renderEmail({
    preheader: 'Your RotaCat confirmation code is {{ .Token }}.',
    heading: 'Confirm your account',
    greeting: GREETING,
    intro: 'Thanks for creating a RotaCat account. Enter this code on the confirmation screen to finish signing up &mdash; it is valid for one hour.',
    panel: panelLabel('Confirmation code') + panelCode('{{ .Token }}'),
    notes: [
      'Once your email is confirmed, an administrator still needs to approve your account to give you full access.',
    ],
    footnote: "If you didn't create a RotaCat account, you can ignore this email.",
  }),
  'reset-password': renderEmail({
    preheader: 'Choose a new RotaCat password.',
    heading: 'Reset your password',
    greeting: GREETING,
    intro: 'We received a request to reset the password for the RotaCat account registered to <strong>{{ .Email }}</strong>. Use the button below to choose a new one.',
    button: { label: 'Choose a new password', href: '{{ .ConfirmationURL }}' },
    notes: [
      'The link is valid for one hour and can be used once. Your new password needs at least 10 characters, including an uppercase letter, a lowercase letter, a number and a symbol.',
    ],
    footnote: "If you didn't ask to reset your password, you can ignore this email.",
  }),
  'change-email': renderEmail({
    preheader: 'Confirm the new email address for your RotaCat account.',
    heading: 'Confirm your new email address',
    greeting: GREETING,
    intro: 'You asked to change the email address on your RotaCat account. The change only takes effect once it has been confirmed from <strong>both</strong> the old and the new inbox.',
    panel:
      panelLabel('Current address') + panelValue('{{ .Email }}') +
      panelLabel('New address') + panelValue('{{ .NewEmail }}', { last: true }),
    button: { label: 'Confirm this change', href: '{{ .ConfirmationURL }}' },
    notes: [
      'Until both confirmations are in, you keep signing in with your current address.',
    ],
    footnote: `If you didn't request this change, please ${adminLink()}.`,
  }),
}

await mkdir(templatesDir, { recursive: true })
for (const [name, html] of Object.entries(authTemplates)) {
  await writeFile(resolve(templatesDir, `${name}.html`), html + '\n')
  console.log(`wrote supabase/templates/${name}.html`)
}

// ── Previews ────────────────────────────────────────────────────────────
if (process.argv.includes('--previews')) {
  const sample = { appUrl: 'https://rotacat.example', email: 'tayla.37pt5v@bumpmail.io' }
  const fill = html => html
    .replaceAll(GREETING, 'Hi Tayla,')
    .replaceAll('{{ .Token }}', '482913')
    .replaceAll('{{ .Email }}', sample.email)
    .replaceAll('{{ .NewEmail }}', 'tayla.vhw@example.org')
    .replaceAll('{{ .ConfirmationURL }}', `${sample.appUrl}/reset-password`)

  const previews = {
    'welcome-admin-created': buildHtml({ firstName: 'Tayla', password: 'BHQ3k=RP9D+LR!', appUrl: sample.appUrl, isReset: false }, sample.email),
    'password-regenerated': buildHtml({ firstName: 'Tayla', password: 'x7Wq#mK2pE$v', appUrl: sample.appUrl, isReset: true }, sample.email),
    'confirm-signup': fill(authTemplates['confirm-signup']),
    'reset-password': fill(authTemplates['reset-password']),
    'change-email': fill(authTemplates['change-email']),
    'account-approved': buildApprovedHtml({ firstName: 'Tayla', appUrl: sample.appUrl, activeFrom: null }),
    'account-approved-scheduled': buildApprovedHtml({ firstName: 'Tayla', appUrl: sample.appUrl, activeFrom: '2026-03-02' }),
    'account-not-approved': buildRejectedHtml({ firstName: 'Tayla', reason: 'We could not match your details to a current staff member. If you have just joined, please register again with your work email.' }),
  }

  // Playwright is a dev-machine tool, not a dependency of the app: resolve
  // it from wherever it is installed globally rather than adding it here.
  const { chromium } = createRequire(import.meta.url)('playwright')
  const browser = await chromium.launch()
  await mkdir(previewsDir, { recursive: true })
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 640, height: 800 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    for (const [name, html] of Object.entries(previews)) {
      await page.setContent(html, { waitUntil: 'networkidle' })
      const file = resolve(previewsDir, `${name}-${scheme}.png`)
      await page.screenshot({ path: file, fullPage: true })
      console.log(`wrote docs/email-templates/${name}-${scheme}.png`)
    }
    await context.close()
  }
  await browser.close()
}
