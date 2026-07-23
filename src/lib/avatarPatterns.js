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
}

export const PATTERN_TYPES = [
  { key: 'dots', label: 'Dots' },
  { key: 'hearts', label: 'Hearts' },
  { key: 'stars', label: 'Stars' },
  { key: 'diamonds', label: 'Diamonds' },
  { key: 'checkerboard', label: 'Checkerboard' },
  { key: 'squares', label: 'Squares' },
]

export function randomPatternType() {
  return PATTERN_TYPES[Math.floor(Math.random() * PATTERN_TYPES.length)].key
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

// Keeps the pattern in the same colour spectrum as the background — lighten
// a dark background, darken a light one — rather than an unrelated hue, so
// it reads as texture instead of a clashing second colour over the initials.
export function patternTintColor(hex) {
  if (!hex || hex.length < 7) return '#FFFFFF'
  const { h, s, l } = hexToHsl(hex)
  const newL = l > 55 ? Math.max(5, l - 22) : Math.min(95, l + 22)
  return hslToHex(h, Math.max(s, 25), newL)
}

// CSS background-* properties that tile the given pattern type over `colorCode`,
// or null when there's no pattern selected.
export function patternBackgroundStyle(patternType, colorCode, tileSize = 16) {
  const shape = PATTERN_SHAPES[patternType]
  if (!shape) return null
  const tint = patternTintColor(colorCode)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="${tint}" fill-opacity="0.45">${shape}</g></svg>`
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: `${tileSize}px ${tileSize}px`,
    backgroundRepeat: 'repeat',
  }
}
