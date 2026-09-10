// Colour-theme catalogue. Data only — the provider that applies a theme lives
// in src/context/ThemeContext.jsx, and the colour values themselves live in
// src/styles/index.css. Nothing here knows a hex except the picker swatches,
// which have to show you the theme you are *not* currently in and so cannot
// read the live custom properties.

export const LIGHT_THEME = 'light'
export const DARK_THEME = 'neutral-dark'

export const THEMES = [
  {
    id: LIGHT_THEME,
    label: 'Daylight',
    hint: 'The original white and teal',
    swatch: ['#FFFFFF', '#DCEEE7', '#0F766E']
  },
  {
    id: DARK_THEME,
    label: 'Neutral dark',
    hint: 'Dark greens and greys, easier on a night shift',
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
