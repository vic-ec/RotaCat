/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Base palette — calm, clinical, low-glare for early-morning use
        ink: {
          DEFAULT: '#0F172A',   // primary text, near-black navy
          light: '#334155',     // secondary text
          muted: '#64748B'      // tertiary / placeholder text
        },
        canvas: {
          DEFAULT: '#F7F6F3',   // app background — warm off-white, not stark white
          raised: '#FFFFFF',    // cards, panels
          sunken: '#EFEDE7'     // input backgrounds, table stripes
        },
        slate: {
          line: '#E4E1D8'       // hairline borders
        },
        // Single confident accent — muted teal, not generic "medical blue"
        accent: {
          DEFAULT: '#0E7C6B',
          dark: '#0A5F52',
          light: '#E3F0EC',
          tint: '#F0F7F5'
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
        // Dark theme — exploratory palette for the "night" look (login, and
        // eventually other screens if the full dark theme goes ahead).
        // Kept as its own namespace rather than overwriting canvas/ink so the
        // existing light-mode screens are completely unaffected until each
        // one is deliberately migrated.
        night: {
          bg: '#0A101C',        // outer page background
          panel: '#0D1526',     // image/hero side panel
          card: '#101B33',      // form panel — one step lighter, "midnight blue"
          ink: '#F1F3F8',       // primary text on dark
          muted: '#8A93A8',     // secondary text on dark
          line: '#223350',      // borders, dividers
          accent: '#1C8FD1',    // primary button — bright blue, not the teal accent
          accentDark: '#156FA6',
          gold: '#D9A74A'       // heading accent — echoes the robot cat's bronze plating
        },
        // Dark theme, variant B — neutral graphite instead of navy.
        // Note this variant's button color in the reference mockup is
        // already close to your existing `accent` teal, so it reuses that
        // token directly rather than introducing a third blue.
        graphite: {
          bg: '#1A1A1A',
          panel: '#242424',
          card: '#2A2A2A',
          ink: '#F1F1EF',
          muted: '#9A9691',
          line: '#3A3A38'
        },
        // Reserved STRICTLY for roster-state semantics — never general UI
        flagRed: {
          DEFAULT: '#C0362C',
          bg: '#FBEAE8'
        },
        flagAmber: {
          DEFAULT: '#B8762E',
          bg: '#FBF1E3'
        },
        flagBlue: {
          DEFAULT: '#3457A6',
          bg: '#EAEEF8'
        },
        success: {
          DEFAULT: '#2E7D4F',
          bg: '#E9F4ED'
        }
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        lg: '12px'
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 6px -1px rgba(15, 23, 42, 0.06)',
        raised: '0 4px 16px -2px rgba(15, 23, 42, 0.10)'
      }
    }
  },
  plugins: []
}
