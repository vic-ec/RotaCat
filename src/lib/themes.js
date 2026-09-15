// Colour-theme catalogue. Data only — the provider that applies a theme lives
// in src/context/ThemeContext.jsx, and the colour values themselves live in
// src/styles/index.css. Nothing here knows a hex except the picker swatches,
// which have to show you the theme you are *not* currently in and so cannot
// read the live custom properties.

export const LIGHT_THEME = 'light'
// The id is not the label: 'neutral-dark' is what is stored per device, what
// `data-theme` carries and what :root[data-theme="neutral-dark"] in
// src/styles/index.css selects on. The palette is called "Night vision" in
// the picker (see THEMES below); renaming the id would silently reset the
// preference of everyone already on it, for no gain.
export const DARK_THEME = 'neutral-dark'

export const THEMES = [
  {
    id: LIGHT_THEME,
    label: 'Daylight',
    swatch: ['#FFFFFF', '#DCEEE7', '#0F766E']
  },
  {
    id: DARK_THEME,
    label: 'Night vision',
    swatch: ['#0F1613', '#1D2F2B', '#6EBDAE']
  }
]

export const THEME_IDS = THEMES.map(t => t.id)

// Shared with the inline boot script in index.html, which applies the stored
// theme before first paint so a dark-theme user never sees a flash of white.
// The two copies have to stay in step: there is no import path into a script
// that must run before the bundle loads.
export const THEME_STORAGE_KEY = 'rotacat.theme'

// The browser-chrome tint (mobile address bar, PWA title bar). Unlike the
// manifest's `theme_color`, which is baked at build time and cannot follow a
// runtime choice, this <meta> tag can.
export const META_THEME_COLOR = {
  [LIGHT_THEME]: '#0F766E',
  [DARK_THEME]: '#0F1613'
}

// The third thing the picker offers, alongside the two palettes above: not a
// palette of its own but a deferral to whatever the device is set to, which
// is also the default for anyone who has never opened the picker. It lives in
// the same localStorage slot as a real theme id — what is stored is the
// CHOICE, and the applied theme is resolved from it (see resolveTheme), so a
// doctor on auto dark mode gets a dark app at dusk without being taught the
// setting exists, and one who picks a palette outright is never overridden.
export const SYSTEM_THEME = 'system'

export const DEFAULT_THEME_CHOICE = SYSTEM_THEME

// Mirrored in index.html's boot script, the same way THEME_STORAGE_KEY is.
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

// What the picker lists. THEMES stays the catalogue of real palettes (the
// swatches, the labels a resolved theme is named by); this is that plus the
// deferral, whose swatch runs from Daylight's ground to Night vision's to
// say it is both, rather than reading as a third palette of its own.
export const THEME_CHOICES = [
  {
    id: SYSTEM_THEME,
    label: 'Match device',
    swatch: ['#FFFFFF', '#0F766E', '#0F1613']
  },
  ...THEMES
]

export const THEME_CHOICE_IDS = THEME_CHOICES.map(c => c.id)

// choice + what the device currently prefers -> the palette to actually
// apply. Anything that isn't one of the two real ids (SYSTEM_THEME, a value
// from a future version, a hand-edited localStorage entry) defers to the
// device rather than being treated as a palette.
export function resolveTheme(choice, prefersDark) {
  if (choice === LIGHT_THEME || choice === DARK_THEME) return choice
  return prefersDark ? DARK_THEME : LIGHT_THEME
}
