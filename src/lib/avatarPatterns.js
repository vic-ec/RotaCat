import { hexToHsl, hslToHex } from './color'

// Selectable avatar dot/icon patterns. Each is a single small shape, tiled
// via a CSS background-image so it repeats across the avatar's identity ring.
const PATTERN_SHAPES = {
  dots: '<circle cx="12" cy="12" r="5"/>',
  hearts: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  stars: '<path d="M12 2l2.6 6.2L21 9l-5 4.6L17.4 20 12 16.5 6.6 20 8 13.6 3 9l6.4-.8z"/>',
  diamonds: '<path d="M12 2l6 10-6 10-6-10z"/>',
  squares: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  // Two diagonal quadrants per tile — adjacent tiles' filled corners meet to
  // form a continuous alternating checkerboard when repeated.
  checkerboard: '<rect x="0" y="0" width="12" height="12"/><rect x="12" y="12" width="12" height="12"/>',
  triangles: '<path d="M12 4l8 16H4z"/>',
  // Stroked, not filled — see STROKE_PATTERNS below.
  spirals: '<path d="M12 12.5c1 0 1.5-.8 1.5-1.7 0-1.4-1.2-2.6-2.8-2.6-2 0-3.7 1.7-3.7 3.9 0 2.6 2.2 4.7 5 4.7 3.2 0 5.8-2.6 5.8-6 0-3.9-3.3-7-7.4-7"/>',
}

// Shapes that read better as an outline than a filled silhouette.
const STROKE_PATTERNS = new Set(['spirals'])

// Keeps the pattern in the same colour spectrum as the background — lighten
// a dark background, darken a light one — rather than an unrelated hue, so
// it reads as texture instead of a clashing second colour over the initials.
export function patternTintColor(hex) {
  if (!hex || hex.length < 7) return '#FFFFFF'
  const { h, s, l } = hexToHsl(hex)
  const newL = l > 55 ? Math.max(5, l - 34) : Math.min(95, l + 34)
  return hslToHex(h, Math.max(s, 35), newL)
}

// CSS background-* properties that tile the given pattern type over `colorCode`,
// or null when there's no pattern selected.
export function patternBackgroundStyle(patternType, colorCode, tileSize = 16) {
  const shape = PATTERN_SHAPES[patternType]
  if (!shape) return null
  const tint = patternTintColor(colorCode)
  const g = STROKE_PATTERNS.has(patternType)
    ? `<g fill="none" stroke="${tint}" stroke-opacity="0.85" stroke-width="2" stroke-linecap="round">${shape}</g>`
    : `<g fill="${tint}" fill-opacity="0.75">${shape}</g>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${g}</svg>`
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${tileSize}px ${tileSize}px`,
    backgroundRepeat: 'repeat',
  }
}
