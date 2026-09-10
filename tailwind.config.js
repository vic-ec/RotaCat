import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // Explicit rather than relying on Tailwind's implicit defaults — these
    // are the values docs/design/layout-spec.md's §15 breakpoint table
    // means by "tablet"/"desktop" (768px/1024px), and they already match
    // Tailwind's own md/lg out of the box. Spelling them out here means a
    // future reader doesn't have to know that to trust it, and it's a no-op
    // today (identical values), so it changes nothing visually.
    screens: {
      sm: '640px',
      md: '768px',   // spec's mobile/tablet boundary
      lg: '1024px',  // spec's tablet/desktop boundary
      xl: '1280px'
    },
    extend: {
      // ── docs/design/layout-spec.md §1 typography tokens ──────────────
      // Opt-in named text styles (`text-h1`, `text-section-label`, …) for
      // the shared PageHeader/SectionLabel/etc. components to build on —
      // additive only, nothing existing switches to these automatically.
      // Where the spec's px size would visually clash with what's already
      // shipped everywhere (e.g. body text is `text-sm`/14px app-wide, spec
      // asks for the same 14px `--font-body`), the value here matches the
      // existing app convention rather than introducing a second, slightly
      // different "standard" size.
      fontSize: {
        h1: ['26px', { lineHeight: '1.3', fontWeight: '600' }],
        h2: ['15px', { lineHeight: '1.4', fontWeight: '600' }],
        'section-label': ['11px', { lineHeight: '1.4', fontWeight: '600', letterSpacing: '0.04em' }],
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        meta: ['12px', { lineHeight: '1.4', fontWeight: '400' }]
      },
      // Matches AppLayout's existing desktop sidebar (`w-60`) — named here
      // so the new mobile NavDrawer/TopAppBar can reference the same value
      // by name instead of a second hardcoded `60`.
      width: {
        sidebar: '15rem' // 240px
      },
      spacing: {
        sidebar: '15rem' // 240px — for padding/margin offsets, not just width
      },
      colors: {
        // Base palette — clinical-operations UI: high-legibility text on a
        // cool mint-teal ground (RotaCat v2 tokens).
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',   // primary text
          light: 'rgb(var(--color-ink-light) / <alpha-value>)',     // secondary text
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)'      // tertiary / placeholder text
        },
        canvas: {
          DEFAULT: 'rgb(var(--color-canvas) / <alpha-value>)',   // app background
          raised: 'rgb(var(--color-canvas-raised) / <alpha-value>)',    // cards, panels
          sunken: 'rgb(var(--color-canvas-sunken) / <alpha-value>)',    // input backgrounds, table stripes
          cool: 'rgb(var(--color-canvas-cool) / <alpha-value>)'  // #F1F8F5
        },
        slate: {
          line: 'rgb(var(--color-slate-line) / <alpha-value>)',      // hairline borders
          // A lighter line again, for the *inside* of a dense data grid
          // (Hours Summary). At phone pixel ratios a collapsed 1px table
          // border paints heavier vertically than horizontally, so a grid
          // drawn entirely in `line` reads as thick columns crossed by thin
          // rows. Dropping the internal lines to this weight makes both
          // directions read as the same hairline; `line` still draws the
          // outer frame and the header, which need to hold their own
          // against the sunken header fill.
          hairline: 'rgb(var(--color-slate-hairline) / <alpha-value>)'  // #E8F0ED
        },
        // Label colour for anything filled with a solid brand or status colour
        // (accent, success, danger, flag*, rose). White on the light theme's
        // deep teal is 5.47:1; on the dark theme's mint it would be 2.20:1, so
        // that theme swaps in the ground colour (8.35:1). Any such fill needs
        // `text-on-fill`, never a literal `text-white`.
        'on-fill': 'rgb(var(--color-on-fill) / <alpha-value>)',

        // The cap* heatmap fills below are deliberately identical in both
        // themes, so the dark label that sits on the pale ones must not follow
        // `ink` (which inverts). This one never changes.
        'on-heat': 'rgb(var(--color-on-heat) / <alpha-value>)',

        // Full-bleed background behind the desktop login/signup card. Was a
        // raw `bg-accent`, which the dark theme would turn into a full-screen
        // mint; it needs to resolve per theme, so it gets its own token.
        'auth-ground': 'rgb(var(--color-auth-ground) / <alpha-value>)',

        // Single confident accent — teal-blue, not generic "medical blue"
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',  // #0F766E
          dark: 'rgb(var(--color-accent-dark) / <alpha-value>)',  // #115E59
          light: 'rgb(var(--color-accent-light) / <alpha-value>)',  // #D7EEE8
          tint: 'rgb(var(--color-accent-tint) / <alpha-value>)',  // #E6F5F1
          // Deeper, cooler mint for auth panels/sheets — same family as
          // accent.light but with more presence against white and better
          // contrast for the text sitting on it.
          panel: 'rgb(var(--color-accent-panel) / <alpha-value>)',  // #C7E8E0
          // `night` is the third step in each DateCard tone family: the
          // time panel of a *night* shift (shift_types.is_night_shift),
          // one shade darker again than the `deep`/`light` day footer, in
          // that tone's own hue — so a night shift reads as darker without
          // losing whether the date is a weekday, a weekend or a public
          // holiday. Each family's `night` sits ~0.13 luminance below its
          // day footer (roughly double the date-panel -> day-footer step,
          // so the difference is unmistakable side by side) and every one
          // keeps the time text (ink-light) above 4.5:1 — 5.27:1 here.
          // See dateWeekend/rose/flagRed below for the other three.
          night: 'rgb(var(--color-accent-night) / <alpha-value>)'  // #B7E0D6
        },
        // Secondary brand accent — warm pink from Lily's collar.
        // Used for links, highlights, and illustrative/marketing touches
        // (login, empty states, onboarding). Not a third "status" color —
        // keep roster-state meaning exclusively on the flag* colors below.
        rose: {
          DEFAULT: 'rgb(var(--color-rose) / <alpha-value>)',  // #D6577E
          dark: 'rgb(var(--color-rose-dark) / <alpha-value>)',  // #B8456F
          light: 'rgb(var(--color-rose-light) / <alpha-value>)',  // #F8E3EA
          tint: 'rgb(var(--color-rose-tint) / <alpha-value>)',  // #FCF0F3
          // Night-shift time panel on a public-holiday date — see
          // accent.night. ink-light on this: 5.27:1.
          night: 'rgb(var(--color-rose-night) / <alpha-value>)'  // #F0CFDB
        },
        // Reserved STRICTLY for roster-state semantics — never general UI
        flagRed: {
          DEFAULT: 'rgb(var(--color-flagRed) / <alpha-value>)',  // #C0362C
          bg: 'rgb(var(--color-flagRed-bg) / <alpha-value>)',  // #FBEAE8
          // One step more saturated than `bg` — same role as accent.light/
          // rose.light, for the shift DateCard's two-panel split.
          deep: 'rgb(var(--color-flagRed-deep) / <alpha-value>)',  // #F1DBD9
          // Night-shift time panel on a conflicted date — see accent.night.
          // ink-light on this: 4.78:1.
          night: 'rgb(var(--color-flagRed-night) / <alpha-value>)'  // #E8C6C2
        },
        flagAmber: {
          DEFAULT: 'rgb(var(--color-flagAmber) / <alpha-value>)',  // #B7791F
          bg: 'rgb(var(--color-flagAmber-bg) / <alpha-value>)'  // #FBF1E1
        },
        flagBlue: {
          DEFAULT: 'rgb(var(--color-flagBlue) / <alpha-value>)',  // #3457A6
          bg: 'rgb(var(--color-flagBlue-bg) / <alpha-value>)'  // #EAEEF8
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',  // #22A06B
          bg: 'rgb(var(--color-success-bg) / <alpha-value>)'  // #E3F5EC
        },
        // Weekend-parity ("Even"/"Odd") signal — a doctor works every weekend
        // of a given parity in a given month, so this needs its own color
        // family, distinct from both the flag*/success roster-state palette
        // (draft/published/conflict semantics) and the teal brand accent
        // (primary actions). Deliberately two cool, muted, non-status hues
        // (indigo/slate) so parity never reads as "good/bad" the way
        // green/red would. `tint` pairs with `DEFAULT` the same way accent/
        // rose's own tint does, for a badge's bg+text combo.
        groupEven: {
          DEFAULT: 'rgb(var(--color-groupEven) / <alpha-value>)',  // #6366F1
          tint: 'rgb(var(--color-groupEven-tint) / <alpha-value>)'  // #E0E7FF
        },
        groupOdd: {
          DEFAULT: 'rgb(var(--color-groupOdd) / <alpha-value>)',  // #64748B
          tint: 'rgb(var(--color-groupOdd-tint) / <alpha-value>)'  // #E2E8F0
        },
        // Dedicated destructive-action red for .btn-danger/.btn-danger-outline
        // — deliberately its own token rather than reusing flagRed, which is
        // reserved strictly for roster-state semantics (see that token's own
        // comment above). This one means "this button does something
        // destructive," not "this roster entry conflicts."
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',  // #DC2626
          dark: 'rgb(var(--color-danger-dark) / <alpha-value>)',  // #B91C1C
          bg: 'rgb(var(--color-danger-bg) / <alpha-value>)'  // #FEE2E2
        },
        // DateCard's weekend tone — a genuinely neutral light gray, distinct
        // from every other tint in this palette (all mint/teal or
        // rose-tinted), so a weekend date reads as neutral rather than
        // another shade of teal. `ink` is verified >=4.5:1 against `tint`
        // (9.37:1) — see the contrast check run for this component.
        dateWeekend: {
          tint: 'rgb(var(--color-dateWeekend-tint) / <alpha-value>)',  // #F3F4F6
          ink: 'rgb(var(--color-dateWeekend-ink) / <alpha-value>)',  // #374151
          // One step more saturated than `tint`, for the shift DateCard's
          // two-panel split (top: date, bottom: time) — same neutral-gray
          // family, just deeper, so the two panels read as distinct
          // without a divider line. Matches Tailwind's own gray-200.
          deep: 'rgb(var(--color-dateWeekend-deep) / <alpha-value>)',  // #E5E7EB
          // Night-shift time panel on a weekend date — see accent.night.
          // Tailwind's gray-300; ink-light on this: 5.13:1.
          night: 'rgb(var(--color-dateWeekend-night) / <alpha-value>)'  // #D1D5DB
        },
        // A dedicated "on leave" presence colour — deliberately separate
        // from the flag* palette above (reserved strictly for roster-state
        // semantics like draft/published/conflict), since this marks a
        // person's current status, not a roster flag. Used by
        // ProfileAvatar's StatusBadge/StatusPicker only.
        statusAway: {
          DEFAULT: 'rgb(var(--color-statusAway) / <alpha-value>)',  // #EAB308
          bg: 'rgb(var(--color-statusAway-bg) / <alpha-value>)'  // #FEF9C3
        },
        // Dedicated 4-step "leave capacity" heatmap palette (Annual Leave
        // planner day/month fill) — kept separate from the flag*/success
        // tokens above (shared with Pending badges, warning banners, etc.
        // elsewhere) so tuning contrast here can never accidentally recolor
        // unrelated UI. Standard, maximally-distinct hues (green/yellow/
        // orange/red) rather than the flagAmber/flagRed pairing, which read
        // too close together at this saturation. Each step: `DEFAULT` (solid
        // year-grid day block), `light` (DEFAULT lightened ~7.5% toward
        // white — the month-view day blocks/legend/day-view pillbox, which
        // read as too saturated at full DEFAULT strength), `tint` (soft
        // alternative background, kept for callers that still want a paler
        // fill), `dark` (public holiday border/fill accent on top of
        // `DEFAULT`), `ink` (on-white text — a shade lighter than `dark` so
        // it still reads as its own hue instead of every state converging
        // on the same near-black brown at high darkness).
        capAvailable: {
          DEFAULT: 'rgb(var(--color-capAvailable) / <alpha-value>)',  // #16A34A
          light: 'rgb(var(--color-capAvailable-light) / <alpha-value>)',  // #3DB369
          tint: 'rgb(var(--color-capAvailable-tint) / <alpha-value>)',  // #DCFCE7
          dark: 'rgb(var(--color-capAvailable-dark) / <alpha-value>)',  // #166534
          ink: 'rgb(var(--color-capAvailable-ink) / <alpha-value>)'  // #15803D
        },
        // Brighter/lighter than the other three states' DEFAULT->light step
        // — the original #EAB308 (Tailwind yellow-500) read as too dark
        // against the legend/day blocks in practice, so DEFAULT and light
        // are the same bright yellow-400 here: the legend (year grid +
        // month workspace both use `fill`/DEFAULT for their dot swatches
        // and day-block fill) and the month/day view (`light`) all render
        // identically instead of two subtly different darker yellows.
        capLimited: {
          DEFAULT: 'rgb(var(--color-capLimited) / <alpha-value>)',  // #FACC15
          light: 'rgb(var(--color-capLimited-light) / <alpha-value>)',  // #FBD12C
          tint: 'rgb(var(--color-capLimited-tint) / <alpha-value>)',  // #FEF9C3
          dark: 'rgb(var(--color-capLimited-dark) / <alpha-value>)',  // #854D0E
          ink: 'rgb(var(--color-capLimited-ink) / <alpha-value>)'  // #A16207
        },
        capNear: {
          DEFAULT: 'rgb(var(--color-capNear) / <alpha-value>)',  // #F97316
          light: 'rgb(var(--color-capNear-light) / <alpha-value>)',  // #FA8B3D
          tint: 'rgb(var(--color-capNear-tint) / <alpha-value>)',  // #FFEDD5
          dark: 'rgb(var(--color-capNear-dark) / <alpha-value>)',  // #9A3412
          ink: 'rgb(var(--color-capNear-ink) / <alpha-value>)'  // #C2410C
        },
        capAtCapacity: {
          DEFAULT: 'rgb(var(--color-capAtCapacity) / <alpha-value>)',  // #DC2626
          light: 'rgb(var(--color-capAtCapacity-light) / <alpha-value>)',  // #E24A4A
          tint: 'rgb(var(--color-capAtCapacity-tint) / <alpha-value>)',  // #FEE2E2
          dark: 'rgb(var(--color-capAtCapacity-dark) / <alpha-value>)',  // #991B1B
          ink: 'rgb(var(--color-capAtCapacity-ink) / <alpha-value>)'  // #B91C1C
        }
      },
      fontFamily: {
        // Figtree is the settled primary — the trial that ran through
        // Satoshi, Inter, Lexend, Public Sans, Archivo, Plus Jakarta Sans,
        // Manrope and Onest (see PR history) ended here, and index.html now
        // loads only what these arrays actually name.
        //
        // Manrope sits behind it as the webfont fallback rather than
        // dropping straight to the system stack: both are geometric sans
        // faces of similar proportion, so a slow or failed Figtree load
        // reflows into something close instead of into whatever
        // system-ui resolves to on that device. The generic entries stay
        // below it as the last resort.
        //
        // `display` and `sans` are deliberately the same stack today —
        // headings aren't set in a distinct face. The token is kept
        // separate so giving them one later is a change here rather than
        // across every heading in the app.
        display: ['Figtree', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        // Serif wordmark treatment reserved for the landing page's "RotaCat"
        // title (AuthHero/MobileAuthHero) — not the app-wide `display` token.
        // Google Fonts serves Fraunces as one variable family (wght 400–700),
        // not a separately-named "SemiBold" static — `Fraunces-SemiBold`
        // doesn't match anything the <link> in index.html actually loads,
        // so it silently fell through to the ui-serif/Georgia fallback
        // instead. The semibold look comes from pairing this family name
        // with `font-semibold` (font-weight: 600) on each usage, not from
        // the family name itself.
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'serif']
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        lg: '12px'
      },
      boxShadow: {
        // Both shadows are theme-dependent: the light theme's slate-tinted
        // rgba is invisible on the dark theme's near-black ground, which
        // leans on a border instead. Values live beside the colour tokens in
        // src/styles/index.css.
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)'
      }
    }
  },
  plugins: [
    // Gate `hover:` behind a real hover-capable pointer. Without this, a tap
    // on a touchscreen fires the same synthetic hover a mouse would — and
    // since it never gets a "mouseout" to clear it, the style just sticks
    // until the next tap anywhere else. That's normally just a cosmetic
    // papercut, but it breaks outright across a same-frame client-side
    // route change: tapping "Sign up" on the Login page lands on the
    // Signup page, and the tap's hover resolves against whatever element
    // the new page renders at those same screen coordinates — the "Clerk"
    // role card, since the two pages' bottom sheets place it right where
    // that link used to be — leaving it permanently highlighted.
    plugin(({ addVariant }) => {
      addVariant('hover', '@media (hover: hover) and (pointer: fine) { &:hover }')
    })
  ]
}
