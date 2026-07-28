import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Base palette — clinical-operations UI: high-legibility text on a
        // cool mint-teal ground (RotaCat v2 tokens).
        ink: {
          DEFAULT: '#1F2937',   // primary text
          light: '#4B5563',     // secondary text
          muted: '#6B7280'      // tertiary / placeholder text
        },
        canvas: {
          DEFAULT: '#FBFDFC',   // app background
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
          bg: '#FBEAE8'
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
