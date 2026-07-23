// Curated colour pool used by the `handle_new_user` signup trigger to assign
// every new profile a colour + pattern-dot pair. Kept in sync with that
// trigger's palette so manually-picked colours (Account Settings) match what
// signup would have assigned.
export const AVATAR_COLOR_PALETTE = [
  '#E17055', '#00B894', '#6C5CE7', '#0984E3', '#FDCB6E', '#E84393',
  '#16A085', '#636E72', '#A29BFE', '#FF7675', '#55EFC4', '#FAB1A0',
]

export const NEUTRAL_AVATAR_COLOR = '#CBD5E1'

// Picks two different colours from the palette — background + pattern dot.
export function randomAvatarColorPair() {
  const i1 = Math.floor(Math.random() * AVATAR_COLOR_PALETTE.length)
  let i2 = Math.floor(Math.random() * AVATAR_COLOR_PALETTE.length)
  while (i2 === i1) i2 = Math.floor(Math.random() * AVATAR_COLOR_PALETTE.length)
  return { colorCode: AVATAR_COLOR_PALETTE[i1], patternDotColor: AVATAR_COLOR_PALETTE[i2] }
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
