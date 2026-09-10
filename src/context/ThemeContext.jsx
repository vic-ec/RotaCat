import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LIGHT_THEME, META_THEME_COLOR, THEMES, THEME_IDS, THEME_STORAGE_KEY } from '../lib/themes'

// Colour-theme switching. Every colour in the app resolves through a CSS
// custom property declared in src/styles/index.css; all this does is stamp
// `data-theme` on <html> so a different block of those properties wins.
// Nothing here knows any colour values, and no component changes when a theme
// is added — that is the whole point of the indirection.
//
// This sits OUTSIDE AuthProvider (see main.jsx): the login, signup and
// pending-approval screens render before any profile exists and still need a
// theme. The preference is per device rather than per profile — it is a
// comfort setting for the screen in front of you, and storing it locally also
// means it is readable before the first paint, which a Supabase round-trip
// would not be.

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return THEME_IDS.includes(stored) ? stored : LIGHT_THEME
  } catch {
    // Private mode, or site data blocked. A theme preference is not worth
    // failing a render over.
    return LIGHT_THEME
  }
}

const ThemeContext = createContext({ theme: LIGHT_THEME, setTheme: () => {}, themes: THEMES })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    // `light` is what bare `:root` already declares, so it is the absence of
    // an attribute rather than a value — which keeps the default render byte
    // for byte what the app produced before any of this existed.
    if (theme === LIGHT_THEME) delete root.dataset.theme
    else root.dataset.theme = theme

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta && META_THEME_COLOR[theme]) meta.setAttribute('content', META_THEME_COLOR[theme])

    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const setTheme = useCallback(next => {
    if (THEME_IDS.includes(next)) setThemeState(next)
  }, [])

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- useTheme is co-located with its provider deliberately, matching AuthContext; splitting it out would mean updating every importer for a DX-only warning
export function useTheme() {
  return useContext(ThemeContext)
}
