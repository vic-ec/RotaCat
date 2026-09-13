// Text size for the roster grids (Rows and Lanes). Both are dense tables that
// were drawn at 12px with 9–11px cell text — readable for some people and not
// for others, and the roster is the screen this app exists to show, so it is
// the one place worth making adjustable rather than picking a compromise.
//
// Everything in those grids is expressed relative to a base font size the
// wrapper sets, so one number here scales the type; the px column widths are
// scaled by the same factor, which is what keeps a larger size from cramming
// the text rather than widening the columns. Both grids already sit in an
// `overflow-x-auto`, so a wider grid scrolls inside its own box instead of
// pushing the page sideways.
export const ROSTER_TEXT_SIZES = [
  { key: 'sm', label: 'S', ariaLabel: 'Small roster text', base: 12 },
  { key: 'md', label: 'M', ariaLabel: 'Medium roster text', base: 14 },
  { key: 'lg', label: 'L', ariaLabel: 'Large roster text', base: 16 },
]

export const DEFAULT_ROSTER_TEXT_SIZE = 'md'
const BASELINE = 12

export const ROSTER_TEXT_SIZE_KEY = 'rotacat.rosterTextSize'

export function rosterTextSize(key) {
  return ROSTER_TEXT_SIZES.find(s => s.key === key) ?? ROSTER_TEXT_SIZES[1]
}

// Multiplier against the original 12px drawing, for scaling column widths.
export function rosterTextScale(key) {
  return rosterTextSize(key).base / BASELINE
}

export function readRosterTextSize() {
  try {
    const stored = localStorage.getItem(ROSTER_TEXT_SIZE_KEY)
    return ROSTER_TEXT_SIZES.some(s => s.key === stored) ? stored : DEFAULT_ROSTER_TEXT_SIZE
  } catch {
    return DEFAULT_ROSTER_TEXT_SIZE
  }
}

export function storeRosterTextSize(key) {
  try { localStorage.setItem(ROSTER_TEXT_SIZE_KEY, key) } catch { /* ignore */ }
}
