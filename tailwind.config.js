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
          DEFAULT: '#1F2937',   // primary text
          light: '#4B5563',     // secondary text
          muted: '#6B7280'      // tertiary / placeholder text
        },
        canvas: {
          DEFAULT: '#FEFFFE',   // app background
          raised: '#FFFFFF',    // cards, panels
          sunken: '#DCEEE7',    // input backgrounds, table stripes
          cool: '#F1F8F5'
        },
        slate: {
          line: '#D7E3DF'       // hairline borders
        },
        // Single confident accent — teal-blue, not generic "medical blue"
        accent: {
          DEFAULT: '#0F766E',
          dark: '#115E59',
          light: '#D7EEE8',
          tint: '#E6F5F1',
          // Deeper, cooler mint for auth panels/sheets — same family as
          // accent.light but with more presence against white and better
          // contrast for the text sitting on it.
          panel: '#C7E8E0'
        },
        // Secondary brand accent — warm pink from Lily's collar.
        // Used for links, highlights, and illustrative/marketing touches
        // (login, empty states, onboarding). Not a third "status" color —
        // keep roster-state meaning exclusively on the flag* colors below.
        rose: {
          DEFAULT: '#D6577E',
          dark: '#B8456F',
          light: '#F8E3EA',
          tint: '#FCF0F3'
        },
        // Reserved STRICTLY for roster-state semantics — never general UI
        flagRed: {
          DEFAULT: '#C0362C',
          bg: '#FBEAE8',
          // One step more saturated than `bg` — same role as accent.light/
          // rose.light, for the shift DateCard's two-panel split.
          deep: '#F1DBD9'
        },
        flagAmber: {
          DEFAULT: '#B7791F',
          bg: '#FBF1E1'
        },
        flagBlue: {
          DEFAULT: '#3457A6',
          bg: '#EAEEF8'
        },
        success: {
          DEFAULT: '#22A06B',
          bg: '#E3F5EC'
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
          DEFAULT: '#6366F1',
          tint: '#E0E7FF'
        },
        groupOdd: {
          DEFAULT: '#64748B',
          tint: '#E2E8F0'
        },
        // Dedicated destructive-action red for .btn-danger/.btn-danger-outline
        // — deliberately its own token rather than reusing flagRed, which is
        // reserved strictly for roster-state semantics (see that token's own
        // comment above). This one means "this button does something
        // destructive," not "this roster entry conflicts."
        danger: {
          DEFAULT: '#DC2626',
          dark: '#B91C1C',
          bg: '#FEE2E2'
        },
        // DateCard's weekend tone — a genuinely neutral light gray, distinct
        // from every other tint in this palette (all mint/teal or
        // rose-tinted), so a weekend date reads as neutral rather than
        // another shade of teal. `ink` is verified >=4.5:1 against `tint`
        // (9.37:1) — see the contrast check run for this component.
        dateWeekend: {
          tint: '#F3F4F6',
          ink: '#374151',
          // One step more saturated than `tint`, for the shift DateCard's
          // two-panel split (top: date, bottom: time) — same neutral-gray
          // family, just deeper, so the two panels read as distinct
          // without a divider line. Matches Tailwind's own gray-200.
          deep: '#E5E7EB'
        },
        // Night-shift marker on a shift DateCard's time footer — read
        // straight off shift_types.is_night_shift, never guessed from the
        // shift code or start hour. Its own token rather than a reuse of
        // `accent`: this is a property of the shift being displayed, not a
        // primary action, and the deep teal has to sit against the same
        // card as accent-tinted UI without reading as a button.
        shiftNight: {
          DEFAULT: '#134E4A',
          ink: '#F0FDFA'
        },
        // A dedicated "on leave" presence colour — deliberately separate
        // from the flag* palette above (reserved strictly for roster-state
        // semantics like draft/published/conflict), since this marks a
        // person's current status, not a roster flag. Used by
        // ProfileAvatar's StatusBadge/StatusPicker only.
        statusAway: {
          DEFAULT: '#EAB308',
          bg: '#FEF9C3'
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
          DEFAULT: '#16A34A',
          light: '#3DB369',
          tint: '#DCFCE7',
          dark: '#166534',
          ink: '#15803D'
        },
        // Brighter/lighter than the other three states' DEFAULT->light step
        // — the original #EAB308 (Tailwind yellow-500) read as too dark
        // against the legend/day blocks in practice, so DEFAULT and light
        // are the same bright yellow-400 here: the legend (year grid +
        // month workspace both use `fill`/DEFAULT for their dot swatches
        // and day-block fill) and the month/day view (`light`) all render
        // identically instead of two subtly different darker yellows.
        capLimited: {
          DEFAULT: '#FACC15',
          light: '#FBD12C',
          tint: '#FEF9C3',
          dark: '#854D0E',
          ink: '#A16207'
        },
        capNear: {
          DEFAULT: '#F97316',
          light: '#FA8B3D',
          tint: '#FFEDD5',
          dark: '#9A3412',
          ink: '#C2410C'
        },
        capAtCapacity: {
          DEFAULT: '#DC2626',
          light: '#E24A4A',
          tint: '#FEE2E2',
          dark: '#991B1B',
          ink: '#B91C1C'
        }
      },
      fontFamily: {
        display: ['Satoshi', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Satoshi', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 6px -1px rgba(15, 23, 42, 0.06)',
        raised: '0 4px 16px -2px rgba(15, 23, 42, 0.16)'
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
