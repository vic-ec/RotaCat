# RotaCat Login — Implementation Spec

Oct 31, 2026 (revised 1 Nov 2026) · Paul Xafis

## How to work

This doc is the complete brief for rebuilding `/login` in `vic-ec/RotaCat`. Follow it without this chat.

1. Inspect before editing: `src/pages/LoginPage.jsx`, `AuthHero.jsx`, `MobileAuthHero.jsx`, `PasswordRevealToggle.jsx`, `CapsLockNotice.jsx`, `AuthFooter.jsx`, `src/styles/index.css`, `tailwind.config.js`, `index.html`, and `package.json` (React version decides the `inert` syntax).
2. Reuse the existing token system (`--color-*` in `index.css`, mapped in `tailwind.config.js`). Add tokens; do not hard-code hex in components.
3. No new dependencies, UI libraries or animation libraries.
4. Do not change: fonts, font sizes, font colours (except where the Accessibility table says so), the mascot image and its treatment, the decorative roster grid and its time labels, the password visibility toggle's icon and behaviour, authentication logic, validation rules, routes, Turnstile. Button sizes, radii and labels stay as they are; only the surface treatment changes.
5. One `SignInForm` component, mounted inline on desktop and inside the existing modal on mobile.
6. Work in two commits: (a) login page and tokens, (b) app-wide button treatment. Run lint and build after each; test desktop (1024, 1440) and mobile (390) before reporting. Finish with: files changed, tokens added, every button location touched, anything from this doc not done and why.

## Decisions

The login page becomes a white two-half card on a deep blue-green page with a brushed-metal sheen, the sign-in form inline on desktop, and a bevelled button treatment applied to every button in the app. Decided 1 Nov 2026; supersedes the theme C / light-mint decision of 31 Oct.

| Decision | Choice | Why |
| --- | --- | --- |
| Page background | Blue-green 6 `#1F6763` with sheen | Deep enough that the white card is the only light object; hue still reads on a weak monitor; same hue family as the app's teal |
| Sheen | Corner-dark diagonal, highlight running bottom-left to top-right, 1 px horizontal grain | Brushed-metal satin, not gloss. Pure CSS, no image |
| Brand half and login half | Both white `#FFFFFF`, flush, 1 px seam | The card is the spotlight; the page carries the colour |
| Desktop form | Inline at `lg:` (1024 px+); modal kept for mobile | Saves a click per login and removes the modal focus-trap problem on desktop |
| Buttons (app-wide) | Inset bevel: 1 px light top edge, 2 px dark bottom edge, no drop shadow | Reads as a physical key against the brushed page; applies to every button, mobile and desktop |
| Text links | Teal `#0F766E` for "Forgot password?" and "Create an account" | Rose `#D6577E` on white is 3.80:1 and fails AA; teal on white is 5.47:1. Rose stays a brand accent, not a UI colour |
| Email placeholder | `Your email` | Neutral; no organisation domain |
| Mobile sheet | White, on the same deep page | The old mint sheet does not work on a deep page; see Mobile |
| Fonts, sizes, font colours | Unchanged from live | Fraunces wordmark, Figtree body, `#1F2937` / `#4B5563` ink |
| Decorative roster grid | Unchanged | Decorative, `aria-hidden`; time labels stay faint |

## Visual spec

One raised white card, two flush halves, a 1 px seam, on a deep blue-green brushed-metal page. Approved 1 Nov.

![Target: Blue-green 6 with sheen, desktop 1600 px, inline form, bevelled button](./target-desktop.png)

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas` | `#1F6763` | Page base colour (Blue-green 6) |
| `--bg-canvas-sheen` | see CSS block below | Page background: the sheen layers over `--color-canvas`. Apply to the auth page wrapper on desktop and mobile |
| `--color-panel` | `#FFFFFF` | Both halves of the card; the mobile sheet |
| `--color-seam` | `#DDE4E2` | 1 px divider; plus `box-shadow: inset -10px 0 14px -14px rgba(15,23,42,.14)` on the brand half's right edge |
| `--color-shell-border` | `#E3E7EB` | 1 px hairline round the card |
| `--color-grid-cell` | `#F1F5F4` | Decorative roster cells |
| `--color-grid-bar` | `#CBD9D5` / `#E0E8E5` | Bars inside cells (primary / secondary) |
| Card radius | 24 px | Outer corners only; halves square |
| Card shadow | `0 30px 60px -26px rgba(0,0,0,.6), 0 2px 6px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.95)` | Near-black so the card separates from the deep page |
| Card inset | 60 px top/bottom, 64 px sides at 1600 px | Scale with viewport; halves stay 50/50 |
| Form width | 456 px, centred in the login half | Heading, fields, button and links share this width |
| Input border | `#0F766E` at 70% (`border-accent/70`), 2 px, 14 px radius | 3.07:1 on white; was 50% |
| Input focus | solid `#0F766E` 2 px outline, 2 px offset | Was `accent/25` |
| Links | `#0F766E`, underlined, `underline-offset-4`, decoration at 45% | "Forgot password?" (right-aligned under Password) and "Create an account" |
| Footer | `#4B5563`, 12 px, bottom of the login half | Was `#6B7280` at 10 px |

Page background CSS (two layers over the base colour; keep the order):

```css
.auth-page {
  background:
    linear-gradient(135deg,
      rgba(0,0,0,.42) 0%, rgba(0,0,0,.18) 22%,
      rgba(255,255,255,.16) 48%, rgba(255,255,255,.07) 56%,
      rgba(0,0,0,.18) 78%, rgba(0,0,0,.45) 100%),
    repeating-linear-gradient(0deg,
      rgba(255,255,255,.05) 0 1px, rgba(0,0,0,.02) 1px 2px, transparent 2px 3px),
    #1F6763;
}
```

Layer 1 darkens the top-left and bottom-right corners and puts the highlight band on the bottom-left to top-right diagonal. Layer 2 is the brushed grain. If a ward monitor shows banding in the margins, remove layer 2 and keep the rest. The sheen is static; no motion.

What does not change: Fraunces 600 wordmark with teal "Cat"; Figtree body; `#1F2937` headings; `#4B5563` secondary text; the mascot image, scale and position; the roster grid and its 45%-opacity time labels.

The seam is subtle by design. If it disappears on a ward monitor, widen it to 2 px before adding any colour. Do not add a mint or grey half, and do not lighten the page to compensate.

## Button system (app-wide)

Every button in RotaCat, on every page and at every breakpoint, takes the same inset bevel. One utility or component class, applied everywhere; no per-page overrides.

![Button states: default, hover, active, focus-visible, disabled, secondary, danger](./button-states.png)

| Variant / state | Treatment |
| --- | --- |
| Primary, default | `background: #0F766E; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.28), inset 0 -2px 0 rgba(0,0,0,.22)`. No outer shadow. Radius, height and type unchanged from the existing button |
| Primary, hover | Background one step darker `#0C6159`; bevel unchanged |
| Primary, active (pressed) | Background `#0C6159`; bevel inverted: `inset 0 2px 0 rgba(0,0,0,.22), inset 0 -1px 0 rgba(255,255,255,.18)` |
| Primary, focus-visible | Existing solid outline (`#1F2937` or `#0F766E`, 2 px, 3 px offset); bevel unchanged |
| Disabled / `aria-disabled` | `opacity: .6; box-shadow: none` — a disabled button is flat |
| Secondary (outlined) | White background, teal text, existing 2 px `accent/70` border; bevel `inset 0 1px 0 rgba(255,255,255,.9), inset 0 -2px 0 rgba(15,118,110,.14)` |
| Danger | Same bevel as primary on the existing red (`inset 0 -2px 0 rgba(0,0,0,.25)`) |
| Icon-only buttons (e.g. the password eye) | No bevel. The bevel is for buttons with a filled or outlined surface |
| Mobile | Identical values. No size change; the bevel is 3 px total and survives any scale |

Implementation notes: put the bevel on a `.btn` base class (or the existing Button component) and remove any per-page `shadow-*` utilities on buttons. Where a button already has a `box-shadow` for another reason, the bevel wins. The Welcome "Sign in" button on mobile, the modal submit buttons, the roster-page actions and the account-page buttons are all in scope. Audit with a grep for `<button` and for `shadow-` on button elements.

## Mobile

The mobile layout (below 1024 px) keeps its structure: hero on top, bottom sheet with the Welcome button, sign-in form in the existing modal. These change:

- Token changes flow through: `Your email` placeholder, teal underlined links, `accent/70` borders, solid focus ring, `#92600F` Caps Lock, footer `#4B5563` 12 px.
- P1-1 (`inert`, `role="dialog"`), P2-3 (`min-h-dvh` / `min-h-[44dvh]`), P3-1 (toggle hit area), P3-2 (link order) apply inside the modal.
- The modal form must also hold field positions: the credential banner sits above the modal title, inline messages in the gap below their field, exactly as on desktop.

Required, not optional: the bottom sheet changes from mint `#C7E8E0` to white `#FFFFFF`, with the same seam treatment along its top edge (`border-top: 1px solid #DDE4E2` and the inset shadow rotated to the top). The page behind the hero and sheet is `--bg-canvas-sheen` on `#1F6763`, same as desktop. The mobile hero (wordmark, mascot, grid) sits on that page, not on a white panel, so the wordmark's dark ink `#1F2937` must be re-checked: if it fails on the deep page, give the mobile hero a white rounded panel matching the desktop brand half rather than changing the font colour. All buttons on mobile take the app-wide bevel.

## SignInForm component

One component, two mounts. State that belongs to the form stays in it; state the page owns is passed down.

| Owned by `SignInForm` | Passed from `LoginPage` |
| --- | --- |
| Email and password values, validity, `emailInvalid` | `onSubmit(email, password)` |
| Reveal state (via the existing `PasswordRevealToggle`) | `error` (credential banner text or null) |
| Caps Lock state (existing `CapsLockNotice`) | `submitting`, `verifying` (Turnstile) |
| Field refs for focus-on-error | `onForgotPassword()` |
| Local ids: `email`, `password`, `email-error`, `verify-status` | `variant: 'inline' \| 'modal'` (only affects the heading element and the banner's anchor) |

Desktop (`lg:` and up): `<SignInForm variant="inline" />` in the login half; the Welcome heading and subtitle are part of the form. Below `lg:`: the existing Welcome button opens the modal, which mounts `<SignInForm variant="modal" />`. The Forgot-password modal is unchanged apart from P1-1.

## Accessibility fixes to implement

Nine changes, roughly three hours. P1 first; the inline desktop form makes P1-1 a mobile-only fix.

| # | Fix | Files | Change | WCAG |
| --- | --- | --- | --- | --- |
| P1-1 | Keep hidden modals out of the tab order; mark the open one as a dialog | `SignInModal`, `ForgotPasswordModal`, `LoginPage.jsx` | Replace `aria-hidden={!isOpen}` with `{...(!isOpen && { inert: '' })}` on the wrapper (React 18 string; boolean in React 19). Add `role="dialog" aria-modal="true" aria-labelledby="signin-title"` on the panel; title becomes `<h2 id="signin-title">`. Set `inert` on the page wrappers while a modal is open. Re-test 1Password, Bitwarden, Chrome and iOS autofill afterwards | 2.4.3, 2.4.7, 4.1.2 |
| P1-2 | Allow pinch-zoom | `index.html` | Remove `maximum-scale=1.0` from the viewport meta. Inputs are already 16 px | 1.4.4 |
| P1-3 | Contrast | `index.css`, `tailwind.config.js`, form components | Links `text-accent underline`; input border `border-accent/70`; error border `border-flagRed` (solid); focus `focus-visible:outline-accent`; add `--color-flagAmber-text: 146 96 15` (`#92600F`) for the Caps Lock notice. Footer `text-xs text-ink-light`. The four mint-panel failures disappear with the white login half | 1.4.3, 1.4.11 |
| P2-1 | Announce errors | Email/password field component, `LoginPage.jsx` | `aria-describedby="email-error"` when invalid; error `<p id="email-error">` with an icon at `text-sm`. Banner wrapper always mounted: `<div role="alert" aria-live="assertive" className="empty:hidden">`. On credential failure set `aria-invalid` on both fields and focus + select the password | 3.3.1, 4.1.2, 4.1.3 |
| P2-2 | Explain the Turnstile wait | `LoginPage.jsx` | `aria-disabled` instead of `disabled`; `aria-describedby="verify-status"`; `<p id="verify-status" role="status">Checking your connection is secure…</p>`; `aria-busy={submitting}` on the form; spinner keeps button width | 4.1.3 |
| P2-3 | Stop mobile sheet clipping at 200% text | `LoginPage.jsx` | `h-dvh` → `min-h-dvh`; `h-[44dvh]` → `min-h-[44dvh]` | 1.4.4, 1.4.10 |
| P3-1 | Enlarge the eye toggle | `PasswordRevealToggle.jsx` | `absolute right-1.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md`; add `aria-pressed={revealed}` and `aria-controls="password"`. Keep `pr-12` on the input. Icon and behaviour unchanged | 2.5.8 |
| P3-2 | Focus order | Form component | Move "Forgot password?" below the password field, right-aligned: Email → Password → Show → Forgot → Sign in | 2.4.3 |
| P3-3 | Headings | `LoginPage.jsx`, modals | "Welcome" `<p>` → `<h2>`; modal titles → `<h2 id=…>` | 1.3.1, 2.4.6 |
| P4-1 | Inline form on desktop | `LoginPage.jsx`, new `SignInForm.jsx` | Render `<SignInForm />` in the login half at `lg:`; keep the Welcome button + modal below `lg:`. One component, two mounts | — |

Also fix `text-[18.9 px]` → `text-lg` if the space is present in the class (reported, not verified here).

**Fixed field positions.** No state may move the Email field, Password field or Sign in button. The credential-error banner is absolutely positioned above the "Welcome" heading (`position:absolute; bottom:100%; margin-bottom:30px` on a wrapper inside the relatively positioned form), so it occupies no layout space. Inline field messages (email invalid, Caps Lock) render inside the existing 22 px gap below their field as zero-height elements (`height:0; overflow:visible`, `translateY(6px)`, 14 px). Verified against four states in the image below.

![Eight states on the final theme](./states-sheet.png)

## Deferred or dropped from the audit

| Item | Status | Reason |
| --- | --- | --- |
| P2-4 height-aware `split` breakpoint (landscape phones) | Deferred | Real issue at 844×390, but it changes every breakpoint gate. Solve it with the inline-form work, after P1–P3 ship |
| P3-4 named type-scale tokens | Deferred | Housekeeping; not blocking. The `text-[18.9 px]` one-liner is in scope |
| P4-2 enlarge mascot 10–15% | Dropped | Tied to the old layout; in the flush two-tone design the mascot already fills the brand half |
| P4-5 passkeys | Dropped (roadmap) | Not a login-page redesign item |
| `rose-deep #9D2F5A` token | Dropped | Not needed once links are teal; rose stays a non-text accent |
| Dark-theme findings | Noted | The `border-accent/70` change covers the one dark-theme failure if a dark theme ships |
| Audit scorecard weights | Ignored | Useful narrative, not a measurement |

## States to design and test

Every audit failure lives in a non-default state. All eight are shown in the image under Fixed field positions, on the final theme. Each state gets a manual check.

| State | Trigger | What must be visible |
| --- | --- | --- |
| Default | Page load, desktop | Inline form, `Your email` placeholder, teal links |
| Focus | Tab to email | Solid teal 2 px outline with offset; `accent/70` border on the unfocused field |
| Email invalid | Blur with bad address | Solid red border, red `text-sm` message with icon, `aria-describedby` wired |
| Credential error | Wrong password | `role="alert"` banner above the "Welcome" heading (no layout shift); both fields `aria-invalid`; focus in password |
| Turnstile wait | Before token arrives | Button `aria-disabled` at 70% teal; status line "Checking your connection is secure…" |
| Loading | After submit | Spinner + "Signing in…" inside the button; width unchanged |
| Caps Lock | Caps on in password | Amber `#92600F` notice with icon under the field |
| 200% text | Browser zoom / OS text size | No clipping; mobile sheet grows; page scrolls |

## Verification before merge

- [ ] `npm run lint` and `npm run build` clean
- [ ] Keyboard-only pass on desktop: Tab never lands on an invisible control; order Email → Password → Show → Forgot → Sign in → Create an account
- [ ] Keyboard-only pass on mobile: focus stays inside the open modal; Escape closes and returns focus
- [ ] axe DevTools: zero contrast or ARIA violations on the login route
- [ ] VoiceOver (iOS) and NVDA or Narrator (Windows): email error and credential banner are announced
- [ ] Password managers after `inert`: 1Password, Bitwarden, Chrome, iOS Keychain all fill both fields
- [ ] 200% text at 390 px: nothing clipped, page scrolls
- [ ] Pinch-zoom works on Android Chrome
- [ ] 768 px: "Create an account" on one line
- [ ] Eye toggle: 40×40 px hit area, icon unchanged, state announced
- [ ] Visual diff against the target image in Visual spec: fonts, sizes and font colours unchanged; mascot and grid unchanged
- [ ] Page background: corners dark, highlight band runs bottom-left to top-right, grain visible in the margins at 100% zoom
- [ ] Every `<button>` in the app shows the bevel; `grep -rn "shadow-" src | grep -i button` returns nothing that overrides it
- [ ] Button active state presses in (bevel inverts); disabled state is flat
- [ ] Mobile sheet is white; wordmark legible on the mobile hero
