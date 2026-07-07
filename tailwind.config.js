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
          sunken: '#EFEDE7',     // input backgrounds, table stripes
          cool: '#F4F6F6'
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
        raised: '0 4px 16px -2px rgba(15, 23, 42, 0.16)'
      }
    }
  },
  plugins: []
}
