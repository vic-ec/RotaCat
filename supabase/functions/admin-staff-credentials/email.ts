// The two emails the Staff list sends: a welcome carrying an admin-issued
// password, and the "new password" variant for Regenerate password.
//
// This is the one place the generated password is allowed to leave the
// function, and it exists in memory only: nothing here logs it, and the
// caller never persists it. If you add logging to this file, log the
// recipient and the outcome — never the body, and never the password.
//
// Layout, palette, dark mode and the SMTP transport live in
// ../_shared/email.ts, shared with account-status-email.

import {
  renderEmail, panelLabel, panelValue, adminLink, escapeHtml, sendEmail, ADMIN_EMAIL,
} from '../_shared/email.ts'

// ── The admin-issued credentials email ──────────────────────────────────
export type WelcomeEmailInput = {
  to: string
  firstName: string
  password: string
  appUrl: string | null
  /** true for "Regenerate password", false for a brand-new account */
  isReset: boolean
}

const PASSWORD_RULES = 'It needs at least 10 characters, including an uppercase letter, a lowercase letter, a number and a symbol.'

export function buildHtml({ firstName, password, appUrl, isReset }: Omit<WelcomeEmailInput, 'to'>, loginEmail: string) {
  return renderEmail({
    preheader: isReset
      ? 'An administrator has issued you a new RotaCat password.'
      : 'Your RotaCat account is ready — your username and temporary password are inside.',
    heading: isReset ? 'Your new RotaCat password' : 'Welcome to RotaCat',
    greeting: `Hi ${escapeHtml(firstName)},`,
    intro: isReset
      ? 'An administrator has issued you a new password. Your previous password no longer works.'
      : 'An administrator has created a RotaCat account for you. It is ready to use right now &mdash; there is no link to click and nothing to activate.',
    panel:
      panelLabel('Username') +
      panelValue(escapeHtml(loginEmail)) +
      panelLabel('Temporary password') +
      panelValue(escapeHtml(password), { last: true, mono: true }),
    button: appUrl ? { label: 'Sign in to your account', href: escapeHtml(appUrl) } : undefined,
    notes: [
      `This temporary password is valid for 14 days. You will be asked to choose your own password the first time you sign in. ${PASSWORD_RULES}`,
    ],
    footnote: `If you weren't expecting this email, please ${adminLink()}.`,
  })
}

export function buildText({ firstName, password, appUrl, isReset }: Omit<WelcomeEmailInput, 'to'>, loginEmail: string) {
  const intro = isReset
    ? 'An administrator has issued you a new password. Your previous password no longer works.'
    : 'An administrator has created a RotaCat account for you. It is ready to use right now.'
  return [
    `Hi ${firstName},`,
    '',
    intro,
    '',
    `Username: ${loginEmail}`,
    `Temporary password: ${password}`,
    '',
    appUrl ? `Sign in: ${appUrl}` : '',
    '',
    'This temporary password is valid for 14 days.',
    'You will be asked to choose your own password the first time you sign in.',
    PASSWORD_RULES,
    '',
    `If you weren't expecting this email, please contact your administrator at ${ADMIN_EMAIL}.`,
    '',
    `RotaCat — vic-ec © ${new Date().getFullYear()}`,
  ].filter(line => line !== undefined).join('\n')
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: input.isReset ? 'Your new RotaCat password' : 'Welcome to RotaCat — your login details',
    text: buildText(input, input.to),
    html: buildHtml(input, input.to),
  })
}
