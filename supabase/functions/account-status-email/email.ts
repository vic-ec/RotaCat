// The two emails a self-registered user gets when an administrator decides
// on their registration: approved, or not approved. Layout, palette, dark
// mode and the SMTP transport live in ../_shared/email.ts.

import {
  renderEmail, panelLabel, panelValue, adminLink, escapeHtml, sendEmail, ADMIN_EMAIL,
} from '../_shared/email.ts'

export type AccountStatusInput = {
  to: string
  firstName: string
  appUrl: string | null
}

export type ApprovedInput = AccountStatusInput & {
  /** ISO date (YYYY-MM-DD) when the account becomes active, if in the future. */
  activeFrom: string | null
}

export type RejectedInput = AccountStatusInput & {
  /** The admin's optional note, shown to the registrant verbatim. */
  reason: string | null
}

// "Monday 2 March 2026" — the date is read once, in an email, so the long
// form beats 2026-03-02. en-GB for day-before-month; the ED is in South
// Africa, which reads dates the same way.
export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function buildApprovedHtml({ firstName, appUrl, activeFrom }: Omit<ApprovedInput, 'to'>): string {
  const scheduled = activeFrom ? formatLongDate(activeFrom) : null
  return renderEmail({
    preheader: 'Your RotaCat account has been approved.',
    heading: 'Your account has been approved',
    greeting: `Hi ${escapeHtml(firstName)},`,
    intro: scheduled
      ? 'An administrator has approved your RotaCat account. You can sign in now, and you will be added to the roster from the date below.'
      : 'An administrator has approved your RotaCat account. You now have full access.',
    panel: scheduled
      ? panelLabel('Active from') + panelValue(escapeHtml(scheduled), { last: true })
      : undefined,
    button: appUrl ? { label: 'Sign in to your account', href: escapeHtml(appUrl) } : undefined,
    footnote: `If anything looks wrong, please ${adminLink()}.`,
  })
}

export function buildApprovedText({ firstName, appUrl, activeFrom }: Omit<ApprovedInput, 'to'>): string {
  return [
    `Hi ${firstName},`,
    '',
    activeFrom
      ? `An administrator has approved your RotaCat account. You can sign in now, and you will be added to the roster from ${formatLongDate(activeFrom)}.`
      : 'An administrator has approved your RotaCat account. You now have full access.',
    '',
    appUrl ? `Sign in: ${appUrl}` : '',
    '',
    `If anything looks wrong, please contact your administrator at ${ADMIN_EMAIL}.`,
    '',
    `RotaCat — vic-ec © ${new Date().getFullYear()}`,
  ].join('\n')
}

export function buildRejectedHtml({ firstName, reason }: Omit<RejectedInput, 'to'>): string {
  const note = reason?.trim()
  return renderEmail({
    preheader: 'An update on your RotaCat registration.',
    heading: 'Your registration was not approved',
    greeting: `Hi ${escapeHtml(firstName)},`,
    intro: 'An administrator has reviewed your RotaCat registration and was not able to approve it.',
    panel: note
      ? panelLabel('Note from the administrator') + panelValue(escapeHtml(note), { last: true, prose: true })
      : undefined,
    notes: [
      `If you think this is a mistake, or you registered with the wrong details, please ${adminLink()}.`,
    ],
  })
}

export function buildRejectedText({ firstName, reason }: Omit<RejectedInput, 'to'>): string {
  const note = reason?.trim()
  return [
    `Hi ${firstName},`,
    '',
    'An administrator has reviewed your RotaCat registration and was not able to approve it.',
    note ? `\nNote from the administrator: ${note}\n` : '',
    `If you think this is a mistake, or you registered with the wrong details, please contact your administrator at ${ADMIN_EMAIL}.`,
    '',
    `RotaCat — vic-ec © ${new Date().getFullYear()}`,
  ].join('\n')
}

export async function sendApprovedEmail(input: ApprovedInput): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: 'Your RotaCat account has been approved',
    text: buildApprovedText(input),
    html: buildApprovedHtml(input),
  })
}

export async function sendRejectedEmail(input: RejectedInput): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: 'An update on your RotaCat registration',
    text: buildRejectedText(input),
    html: buildRejectedHtml(input),
  })
}
