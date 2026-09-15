import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DARK_SCHEME_QUERY, DEFAULT_THEME_CHOICE, LIGHT_THEME, META_THEME_COLOR, resolveTheme,
  THEMES, THEME_CHOICES, THEME_CHOICE_IDS, THEME_STORAGE_KEY,
} from '../lib/themes'

// Colour-theme switching. Every colour in the app resolves through a CSS
// custom property declared in src/styles/index.css; all this does is stamp
// `data-theme` on <html> so a different block of those properties wins.
// Nothing here knows any colour values, and no component changes when a theme
// is added — that is the whole point of the indirection.
//
// Two values, not one: `choice` is what the doctor picked and what gets
// stored ('system' by default, or a palette id to pin one outright), `theme`
// is the palette that choice resolves to right now. Consumers want `theme` —
// it is always one of the real palettes; only the picker cares about
// `choice`.
//
// This sits OUTSIDE AuthProvider (see main.jsx): the login, signup and
// pending-approval screens render before any profile exists and still need a
// theme. The preference is per device rather than per profile — it is a
// comfort setting for the screen in front of you, and storing it locally also
// means it is readable before the first paint, which a Supabase round-trip
// would not be.

function readStoredChoice() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return THEME_CHOICE_IDS.includes(stored) ? stored : DEFAULT_THEME_CHOICE
  } catch {
    // Private mode, or site data blocked. A theme preference is not worth
    // failing a render over.
    return DEFAULT_THEME_CHOICE
  }
}

// Same matchMedia-may-not-exist guard as useIsDesktop — jsdom has none, and
// the answer there (no dark preference) is the light default the app has
// always had.
const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

function readPrefersDark() {
  return hasMatchMedia() ? window.matchMedia(DARK_SCHEME_QUERY).matches : false
}

const ThemeContext = createContext({
  theme: resolveTheme(DEFAULT_THEME_CHOICE, false),
  choice: DEFAULT_THEME_CHOICE,
  setTheme: () => {},
  themes: THEMES,
  choices: THEME_CHOICES,
})

export function ThemeProvider({ children }) {
  const [choice, setChoiceState] = useState(readStoredChoice)
  const [prefersDark, setPrefersDark] = useState(readPrefersDark)
  const theme = resolveTheme(choice, prefersDark)

  // Live, not read-once: a phone on automatic dark mode flips at dusk, and
  // an app left open on a ward computer should follow it there and then
  // rather than at the next reload.
  useEffect(() => {
    if (!hasMatchMedia()) return undefined
    const mq = window.matchMedia(DARK_SCHEME_QUERY)
    const handler = e => setPrefersDark(e.matches)
    // Re-read on mount too: the OS can flip between the first render and
    // this effect (or while the tab was in the background), and the stale
    // value would otherwise sit there until the next flip.
    setPrefersDark(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    // `light` is what bare `:root` already declares, so it is the absence of
    // an attribute rather than a value — which keeps the default render byte
    // for byte what the app produced before any of this existed.
    if (theme === LIGHT_THEME) delete root.dataset.theme
    else root.dataset.theme = theme

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta && META_THEME_COLOR[theme]) meta.setAttribute('content', META_THEME_COLOR[theme])
  }, [theme])

  // Stored separately from the applied theme above: what persists is the
  // choice, so 'system' survives a reload as 'system' rather than being
  // frozen into whichever palette it happened to resolve to.
  useEffect(() => {
    try { localStorage.setItem(THEME_STORAGE_KEY, choice) } catch { /* ignore */ }
  }, [choice])

  const setTheme = useCallback(next => {
    if (THEME_CHOICE_IDS.includes(next)) setChoiceState(next)
  }, [])

  const value = useMemo(
    () => ({ theme, choice, setTheme, themes: THEMES, choices: THEME_CHOICES }),
    [theme, choice, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- useTheme is co-located with its provider deliberately, matching AuthContext; splitting it out would mean updating every importer for a DX-only warning
export function useTheme() {
  return useContext(ThemeContext)
}
