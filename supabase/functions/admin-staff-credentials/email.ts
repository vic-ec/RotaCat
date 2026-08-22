// Welcome email carrying an admin-issued password, sent over the same
// Gmail SMTP relay the project's auth emails already go through.
//
// This is the one place the generated password is allowed to leave the
// function, and it exists in memory only: nothing here logs it, and the
// caller never persists it. If you add logging to this file, log the
// recipient and the outcome — never the body, and never the password.
//
// denomailer is imported lazily, inside the send call, on purpose. A
// top-level import that fails to resolve takes the whole function down
// with it — account creation included — which is the opposite of what
// this design promises: creating the account and delivering the password
// are meant to fail independently, so a mail problem must degrade to
// "email failed, here is the password to relay by hand" rather than to a
// dead endpoint. The specifier stays a literal so the deploy-time bundler
// can still see and vendor it — laziness here is about when the module is
// evaluated, not about hiding the dependency.

// Brand tokens, matching tailwind.config.js: accent teal #0F766E, canvas
// #F3F8F7, ink #1F2937. Inlined as literal hex because an HTML email has
// no stylesheet to reach for.
const ACCENT = '#0F766E'
const CANVAS = '#F3F8F7'
const INK = '#1F2937'
const INK_MUTED = '#6B7280'
const LINE = '#E2E8F0'

export type WelcomeEmailInput = {
  to: string
  firstName: string
  password: string
  appUrl: string | null
  /** true for "Regenerate password", false for a brand-new account */
  isReset: boolean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function smtpConfig() {
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!user || !pass) {
    throw new Error('SMTP is not configured (SMTP_USER / SMTP_PASS are unset).')
  }
  return {
    hostname: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
    port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
    username: user,
    password: pass,
    from: Deno.env.get('SMTP_FROM') ?? user,
    fromName: Deno.env.get('SMTP_FROM_NAME') ?? 'RotaCat',
  }
}

function buildHtml({ firstName, password, appUrl, isReset }: Omit<WelcomeEmailInput, 'to'>, loginEmail: string) {
  const heading = isReset ? 'Your new RotaCat password' : 'Welcome to RotaCat'
  const intro = isReset
    ? 'An administrator has issued you a new password. Your previous password no longer works.'
    : 'An administrator has created a RotaCat account for you. It is ready to use right now — there is no link to click and nothing to activate.'

  const button = appUrl
    ? `<tr><td style="padding: 8px 0 4px;">
         <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Sign in to RotaCat</a>
       </td></tr>`
    : ''

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${ACCENT};padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.2px;">RotaCat</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${INK};">Hi ${escapeHtml(firstName)},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(intro)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};border:1px solid ${LINE};border-radius:8px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:${INK_MUTED};">Username</p>
                      <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:${INK};word-break:break-all;">${escapeHtml(loginEmail)}</p>
                      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:${INK_MUTED};">Temporary password</p>
                      <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:1px;color:${INK};word-break:break-all;">${escapeHtml(password)}</p>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                  ${button}
                </table>

                <p style="margin:20px 0 0;font-size:14px;line-height:1.55;color:${INK_MUTED};">
                  You will be asked to choose your own password the first time you sign in. It needs at least 10 characters,
                  including an uppercase letter, a lowercase letter, a number and a symbol.
                </p>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${INK_MUTED};">
                  If you weren't expecting this email, please contact your roster administrator.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:${INK_MUTED};">RotaCat — VHW Emergency Centre</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildText({ firstName, password, appUrl, isReset }: Omit<WelcomeEmailInput, 'to'>, loginEmail: string) {
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
    'You will be asked to choose your own password the first time you sign in.',
    'It needs at least 10 characters, including an uppercase letter, a lowercase letter, a number and a symbol.',
    '',
    "If you weren't expecting this email, please contact your roster administrator.",
    '',
    'RotaCat — VHW Emergency Centre',
  ].filter(line => line !== undefined).join('\n')
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const cfg = smtpConfig()
  const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
  const client = new SMTPClient({
    connection: {
      hostname: cfg.hostname,
      port: cfg.port,
      tls: cfg.port === 465,
      auth: { username: cfg.username, password: cfg.password },
    },
  })

  try {
    await client.send({
      from: `${cfg.fromName} <${cfg.from}>`,
      to: input.to,
      subject: input.isReset ? 'Your new RotaCat password' : 'Welcome to RotaCat — your login details',
      content: buildText(input, input.to),
      html: buildHtml(input, input.to),
    })
  } finally {
    // Always close, including on a send failure — leaving the connection
    // open would keep the isolate alive past the response.
    await client.close().catch(() => {})
  }
}
