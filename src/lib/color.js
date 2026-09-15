// Curated colour pool used by the `handle_new_user` signup trigger to assign
// every new profile a colour + pattern-dot pair. Kept in sync with that
// trigger's palette so manually-picked colours (Account Settings) match what
// signup would have assigned.
export const AVATAR_COLOR_PALETTE = [
  '#E17055', '#00B894', '#6C5CE7', '#0984E3', '#FDCB6E', '#E84393',
  '#16A085', '#636E72', '#A29BFE', '#FF7675', '#55EFC4', '#FAB1A0',
  '#FD79A8', '#F9CA24', '#F0932B', '#EB4D4B', '#6AB04C', '#22A6B3',
  '#4834D4', '#7ED6DF',
  '#F368E0', '#FF9F43', '#EE5A24', '#0FB9B1', '#10AC84', '#5F27CD',
  '#341F97', '#C0392B', '#8E44AD', '#2C3E50', '#27AE60', '#2980B9',
  '#D35400', '#FFC312', '#B33771', '#182C61', '#12CBC4', '#EA2027',
  '#5758BB', '#009432',
]

export const NEUTRAL_AVATAR_COLOR = '#CBD5E1'

// Darker shades used as a placeholder fill for profiles with no uploaded
// photo — picked deterministically per profile (a stable hash of their id,
// not re-randomized on every render) so the same person always gets the
// same placeholder, while different people land on visibly different hues.
const PLACEHOLDER_AVATAR_COLORS = [
  '#1E40AF', // blue
  '#991B1B', // red
  '#854D0E', // yellow
  '#166534', // green
  '#9A3412', // orange
  '#3730A3', // indigo
  '#5B21B6', // violet
]

export function placeholderAvatarColor(id) {
  if (!id) return PLACEHOLDER_AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return PLACEHOLDER_AVATAR_COLORS[Math.abs(hash) % PLACEHOLDER_AVATAR_COLORS.length]
}

export function randomAvatarColor() {
  return AVATAR_COLOR_PALETTE[Math.floor(Math.random() * AVATAR_COLOR_PALETTE.length)]
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Desaturates + normalizes lightness of a person's identity colour into a
// muted, always-white-text-legible tone for the flat avatar fill — keeps
// each person visually distinct without the vivid, high-saturation look the
// picker palette uses for its own swatches.
export function mutedAvatarColor(hex) {
  if (!hex || hex.length < 7) return '#94A3B8'
  const { h, s } = hexToHsl(hex)
  return hslToHex(h, Math.min(s, 38), 42)
}

// Picks readable ink (dark) or white text against an arbitrary hex background —
// the curated + legacy roster palettes span very light (khaki, peachpuff) to
// very dark (slate) colours, so a fixed text colour isn't legible on all of them.
export function contrastTextColor(hex) {
  if (!hex || hex.length < 7) return '#111827'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#111827' : '#FFFFFF'
}

// ── Keeping an identity colour visible against the page ──────────────
//
// Every doctor carries a colour, and a handful of them sit almost exactly on
// one of the two themes' grounds: #182C61 against the dark theme's raised
// surface is 1.05:1, which is not a dark pill, it is no pill at all. The same
// happens at the other end on Daylight — #55EFC4 on white is 1.45:1.
//
// The fix is an outline rather than a substitution: the fill stays the exact
// colour the doctor chose (it is how they are recognised on a roster), and a
// rim of the SAME hue, pushed away from the ground, draws the shape. Only the
// colours that need it get one — an outline on every swatch would just be
// noise.
//
// The reference ground is the lightest surface each theme puts a swatch on
// (canvas-raised), which is the worst case in both directions: the dark
// theme's problem colours are dark, the light theme's are light.
const SWATCH_GROUND = {
  light: '#FFFFFF',       // --color-canvas-raised, light
  'neutral-dark': '#1D2F2B', // --color-canvas-raised, dark
}

// Below this, a swatch is not reliably distinguishable from the page.
const EDGE_BELOW_RATIO = 2
// What the outline itself has to reach — 3:1, WCAG's own bar for a graphical
// object that carries meaning (SC 1.4.11).
const EDGE_TARGET_RATIO = 3

function channelLuminance(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex) {
  const r = channelLuminance(parseInt(hex.slice(1, 3), 16))
  const g = channelLuminance(parseInt(hex.slice(3, 5), 16))
  const b = channelLuminance(parseInt(hex.slice(5, 7), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG relative contrast, 1:1 (identical) to 21:1 (black on white).
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// The outline a swatch of `hex` needs on `theme`, or null when the colour
// already stands clear of the page on its own. Same hue and saturation,
// lightness walked away from the ground in 4% steps until it clears
// EDGE_TARGET_RATIO — so the rim always reads as the same colour, just
// lighter (on the dark theme) or deeper (on Daylight).
export function swatchEdgeColor(hex, theme) {
  if (!hex || hex.length < 7) return null
  const ground = SWATCH_GROUND[theme] ?? SWATCH_GROUND.light
  if (contrastRatio(hex, ground) >= EDGE_BELOW_RATIO) return null

  const { h, s, l } = hexToHsl(hex)
  const lighten = relativeLuminance(ground) < 0.5
  let candidate = hex
  for (let step = 1; step <= 24; step++) {
    const nextL = lighten ? Math.min(l + step * 4, 92) : Math.max(l - step * 4, 8)
    candidate = hslToHex(h, s, nextL)
    // Either it clears the bar, or lightness has run out and this is the
    // furthest this hue goes — better a rim that falls short than none.
    if (contrastRatio(candidate, ground) >= EDGE_TARGET_RATIO || nextL === 92 || nextL === 8) break
  }
  return candidate
}

// Inline style for a filled swatch (a dot, a name pill, an avatar) in a
// doctor's own colour. The outline is an INSET box-shadow rather than a
// border: it costs no layout, so a swatch that gains one doesn't shift the
// row it sits in, and it can't be clipped by a scroll container the way an
// outset ring can. `text: true` adds the readable ink/white for a pill with
// a name in it.
export function swatchFillStyle(hex, theme, { text = false } = {}) {
  const style = { backgroundColor: hex }
  if (text) style.color = contrastTextColor(hex)
  const edge = swatchEdgeColor(hex, theme)
  if (edge) style.boxShadow = `inset 0 0 0 1px ${edge}`
  return style
}

// The same colour as a STROKE — a roster chip's colour rail, say, where
// there is no fill to put a rim inside and the mark itself has to carry the
// contrast. Returns the adjusted shade for a colour that needs it, and the
// colour untouched for one that doesn't.
export function swatchStrokeColor(hex, theme) {
  return swatchEdgeColor(hex, theme) ?? hex
}
