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
