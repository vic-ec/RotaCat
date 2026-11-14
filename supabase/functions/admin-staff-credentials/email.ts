// Welcome email carrying an admin-issued password, sent over the same
// Gmail SMTP relay the project's auth emails already go through — see
// smtpConfig below for the GMAIL_SMTP_* secrets it reads.
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
//
// This file is also the single source of the email *layout* for every
// message RotaCat sends. The three Supabase Auth templates (sign-up code,
// password reset, email change) are generated from `renderEmail` below by
// `scripts/email-templates.mjs` into supabase/templates/, so all five
// emails share one header, one palette and one dark-mode treatment. Keep
// everything above `smtpConfig` free of Deno globals: that script runs
// this module under Node.

// ── Palette ─────────────────────────────────────────────────────────────
// Copied verbatim from src/styles/index.css — inlined as literal hex
// because an HTML email has no stylesheet to reach for. `light` is the
// default theme's tokens, `dark` is `[data-theme="neutral-dark"]`'s. The
// email paints the light values inline and swaps to the dark ones under
// `prefers-color-scheme: dark` (see DARK_MODE_CSS), so a phone in night
// mode gets the app's night palette rather than the client's inversion.
export const EMAIL_PALETTE = {
  light: {
    canvas: '#F3F5F6',    // canvas — the grey app ground behind cards
    raised: '#FFFFFF',    // canvas.raised — the card
    cool: '#F1F8F5',      // canvas.cool — inset panels (credentials, code)
    line: '#D7E3DF',      // slate.line
    ink: '#1F2937',       // ink
    inkLight: '#4B5563',  // ink.light
    inkMuted: '#6B7280',  // ink.muted
    accent: '#0F766E',    // accent — "Cat", button fill, links
    onFill: '#FFFFFF',    // on-fill — label on an accent fill
  },
  dark: {
    canvas: '#0A100E',
    raised: '#162421',
    cool: '#1B2B27',
    line: '#283C37',
    ink: '#D6DEDC',
    inkLight: '#A0B3AC',
    inkMuted: '#7E9690',
    accent: '#6EBDAE',
    onFill: '#0F1613',
  },
} as const

type Palette = typeof EMAIL_PALETTE.light

// Fraunces is what the app sets the wordmark in; a client that will fetch
// a webfont (Apple Mail, iOS Mail, Outlook for Mac) gets it from the
// <link> in the head, and every other client falls through to Georgia —
// the same chain the app's own `font-serif` token declares. Figtree is the
// app's body face; the system stack behind it is deliberately the usual
// email-safe one so the fallback reads as "a clean sans", not as a serif.
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif"
const SANS = "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600&family=JetBrains+Mono:wght@500&display=swap'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Layout ──────────────────────────────────────────────────────────────
// Every part is already-safe HTML: callers escape user-supplied values
// themselves (the Auth templates pass Go placeholders through verbatim).
export type EmailParts = {
  /** Hidden first line shown next to the subject in the inbox list. */
  preheader: string
  heading: string
  /** "Hi Misu," — omitted when the recipient's name isn't known. */
  greeting?: string
  intro: string
  /** The inset panel: credentials, a one-time code, an address pair. */
  panel?: string
  button?: { label: string; href: string }
  /** Secondary paragraphs in muted ink, after the button. */
  notes?: string[]
  /** The last line, in the smallest size: "If you weren't expecting this…" */
  footnote?: string
}

// The dark-mode sheet. Every colour that the inline styles paint has a
// class here, and the media query re-paints it with the dark token. The
// `[data-ogsc]`/`[data-ogsb]` twins are for Outlook.com and Outlook's
// apps, which rewrite the sheet into those attribute selectors instead of
// honouring the media query. Gmail strips <style> in some surfaces and
// applies its own inversion there regardless — the inline light palette
// is what it starts from, which is the readable case.
function darkModeCss(d: Palette) {
  const rules = `
      .rc-canvas { background-color: ${d.canvas} !important; }
      .rc-card { background-color: ${d.raised} !important; border-color: ${d.line} !important; }
      .rc-rule { border-color: ${d.line} !important; }
      .rc-panel { background-color: ${d.cool} !important; border-color: ${d.line} !important; }
      .rc-ink { color: ${d.ink} !important; }
      .rc-ink-light { color: ${d.inkLight} !important; }
      .rc-ink-muted { color: ${d.inkMuted} !important; }
      .rc-accent { color: ${d.accent} !important; }
      .rc-button { background-color: ${d.accent} !important; border-color: ${d.accent} !important; color: ${d.onFill} !important; }
      .rc-button a, .rc-button span { color: ${d.onFill} !important; }
      .rc-link { color: ${d.accent} !important; }`
  return `
      @media (prefers-color-scheme: dark) {${rules}
      }
      [data-ogsc] .rc-ink, [data-ogsc] .rc-ink * { color: ${d.ink} !important; }
      [data-ogsc] .rc-ink-light { color: ${d.inkLight} !important; }
      [data-ogsc] .rc-ink-muted { color: ${d.inkMuted} !important; }
      [data-ogsc] .rc-accent, [data-ogsc] .rc-link { color: ${d.accent} !important; }
      [data-ogsb] .rc-canvas { background-color: ${d.canvas} !important; }
      [data-ogsb] .rc-card { background-color: ${d.raised} !important; border-color: ${d.line} !important; }
      [data-ogsb] .rc-panel { background-color: ${d.cool} !important; border-color: ${d.line} !important; }
      [data-ogsb] .rc-button { background-color: ${d.accent} !important; }
      [data-ogsc] .rc-button a { color: ${d.onFill} !important; }`
}

// The "RotaCat" wordmark, matching src/components/RotaCat.jsx and the
// login hero: "Rota" in ink, "Cat" in accent, Fraunces semibold. It can
// only carry its two colours against the card's own ground, which is why
// the header is the card colour rather than a solid teal band.
function wordmark(p: Palette) {
  return `<span class="rc-ink" style="font-family:${SERIF};font-size:30px;line-height:1.1;font-weight:600;letter-spacing:0.2px;color:${p.ink};">Rota<span class="rc-accent" style="color:${p.accent};">Cat</span></span>`
}

// Every "RotaCat" in running text gets the wordmark's two-tone treatment
// too: "Rota" inherits the surrounding ink, "Cat" takes the accent (and
// the dark accent under dark mode via .rc-accent). The button label does
// not name the app — on an accent fill the teal "Cat" would vanish — so
// nothing passes a button through this.
export function brand(html: string): string {
  const p = EMAIL_PALETTE.light
  return html.replace(/RotaCat/g, `Rota<span class="rc-accent" style="color:${p.accent};">Cat</span>`)
}

// Where to send someone who wasn't expecting an email. A mailto: link in
// the accent colour, re-painted mint under dark mode via .rc-link.
export const ADMIN_EMAIL = 'admin.rotacat@gmail.com'
export function adminLink(label = 'contact your administrator'): string {
  const p = EMAIL_PALETTE.light
  return `<a class="rc-link" href="mailto:${ADMIN_EMAIL}" style="color:${p.accent};text-decoration:underline;">${label}</a>`
}

// The footer's copyright line. The function renders this at send time;
// the generated Auth templates bake in the year they were generated, so
// regenerate them each January (see supabase/templates/README.md).
export function footerLine(): string {
  return `vic-ec &copy; ${new Date().getFullYear()}`
}

export function renderEmail(parts: EmailParts): string {
  const p = EMAIL_PALETTE.light
  const d = EMAIL_PALETTE.dark
  const b = brand
  const greeting = parts.greeting
    ? `<p class="rc-ink" style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${p.ink};">${b(parts.greeting)}</p>`
    : ''
  const panel = parts.panel
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rc-panel" style="margin:22px 0 0;background-color:${p.cool};border:1px solid ${p.line};border-radius:10px;">
                  <tr><td style="padding:18px 20px;">${b(parts.panel)}</td></tr>
                </table>`
    : ''
  const button = parts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
                  <tr>
                    <td class="rc-button" style="background-color:${p.accent};border:1px solid ${p.accent};border-radius:8px;">
                      <a href="${parts.button.href}" style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1.2;color:${p.onFill};text-decoration:none;">${parts.button.label}</a>
                    </td>
                  </tr>
                </table>`
    : ''
  const notes = (parts.notes ?? [])
    .map(n => `<p class="rc-ink-light" style="margin:22px 0 0;font-size:14px;line-height:1.6;color:${p.inkLight};">${b(n)}</p>`)
    .join('\n                ')
  const footnote = parts.footnote
    ? `<p class="rc-ink-muted rc-rule" style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${p.line};font-size:13px;line-height:1.55;color:${p.inkMuted};">${b(parts.footnote)}</p>`
    : ''

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${parts.heading}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${FONT_LINK}" rel="stylesheet">
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
      ${darkModeCss(d)}
    </style>
  </head>
  <body class="rc-canvas" style="margin:0;padding:0;background-color:${p.canvas};font-family:${SANS};color:${p.ink};">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${p.canvas};">${parts.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rc-canvas" style="background-color:${p.canvas};">
      <tr>
        <td align="center" style="padding:32px 12px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rc-card" style="max-width:540px;background-color:${p.raised};border:1px solid ${p.line};border-radius:14px;">
            <tr>
              <td class="rc-rule" style="padding:26px 32px 22px;border-bottom:1px solid ${p.line};">
                ${wordmark(p)}
                <div class="rc-ink-muted" style="margin-top:6px;font-family:${SANS};font-size:13px;line-height:1.4;color:${p.inkMuted};">Smart ED scheduling, made effortless</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 30px;">
                <h1 class="rc-ink" style="margin:0 0 16px;font-family:${SANS};font-size:22px;line-height:1.3;font-weight:600;color:${p.ink};">${b(parts.heading)}</h1>
                ${greeting}
                <p class="rc-ink" style="margin:0;font-size:15px;line-height:1.6;color:${p.ink};">${b(parts.intro)}</p>
                ${panel}
                ${button}
                ${notes}
                ${footnote}
              </td>
            </tr>
          </table>
          <p class="rc-ink-muted" style="margin:18px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${p.inkMuted};">${b('RotaCat')} &middot; ${footerLine()}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// Small typeset helpers for the inset panel, shared by all five emails.
export function panelLabel(text: string): string {
  const p = EMAIL_PALETTE.light
  return `<p class="rc-ink-muted" style="margin:0 0 4px;font-family:${SANS};font-size:11px;font-weight:600;line-height:1.4;text-transform:uppercase;letter-spacing:0.08em;color:${p.inkMuted};">${text}</p>`
}
export function panelValue(html: string, opts: { last?: boolean; mono?: boolean } = {}): string {
  const p = EMAIL_PALETTE.light
  const family = opts.mono ? MONO : SANS
  const size = opts.mono ? '20px' : '15px'
  const spacing = opts.mono ? 'letter-spacing:0.08em;' : ''
  return `<p class="rc-ink" style="margin:0 ${opts.last ? '' : '0 16px'};font-family:${family};font-size:${size};font-weight:600;line-height:1.4;${spacing}color:${p.ink};word-break:break-all;">${html}</p>`
}
// A one-time code set large, for reading off a phone and typing elsewhere.
export function panelCode(html: string): string {
  const p = EMAIL_PALETTE.light
  return `<p class="rc-ink" style="margin:0;font-family:${MONO};font-size:32px;font-weight:600;line-height:1.2;letter-spacing:0.22em;color:${p.ink};text-align:center;">${html}</p>`
}

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
      `You will be asked to choose your own password the first time you sign in. ${PASSWORD_RULES}`,
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
    'You will be asked to choose your own password the first time you sign in.',
    PASSWORD_RULES,
    '',
    `If you weren't expecting this email, please contact your administrator at ${ADMIN_EMAIL}.`,
    '',
    `RotaCat — vic-ec © ${new Date().getFullYear()}`,
  ].filter(line => line !== undefined).join('\n')
}

// ── Transport ───────────────────────────────────────────────────────────
// Reads the GMAIL_SMTP_* secrets set on the project. The credentials are
// the same Gmail address and app password the Supabase Auth SMTP settings
// already use for the OTP emails — Auth's own copy isn't readable from a
// function, so this needs its own.
//
// A missing secret throws rather than falling back to some default sender:
// the caller catches it, reports the email as failed, and shows the admin
// the generated password to relay by hand, which is a far better outcome
// than silently not sending.
function smtpConfig() {
  const user = Deno.env.get('GMAIL_SMTP_USER')
  const pass = Deno.env.get('GMAIL_SMTP_PASS')
  if (!user || !pass) {
    throw new Error('SMTP is not configured (GMAIL_SMTP_USER / GMAIL_SMTP_PASS are unset).')
  }
  return {
    hostname: Deno.env.get('GMAIL_SMTP_HOST') ?? 'smtp.gmail.com',
    port: Number(Deno.env.get('GMAIL_SMTP_PORT') ?? '465'),
    username: user,
    password: pass,
    from: Deno.env.get('GMAIL_SMTP_FROM') ?? user,
    fromName: Deno.env.get('GMAIL_SMTP_FROM_NAME') ?? 'RotaCat',
  }
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
    //
    // Wrapped in try/catch rather than `.catch()` on the return value:
    // denomailer's close() resolves to undefined here, so chaining .catch
    // off it threw "Cannot read properties of undefined (reading 'catch')"
    // — from a finally block, which replaced the successful send with a
    // TypeError and reported every delivered email as failed. Nothing this
    // close does is worth failing a sent email over, so a close error is
    // swallowed entirely. `await undefined` is fine, so this holds whether
    // or not a future version returns a promise.
    try {
      await client.close()
    } catch {
      /* the message is already sent (or already failed) — closing is cleanup */
    }
  }
}
