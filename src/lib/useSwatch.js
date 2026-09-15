import { useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'
import { swatchFillStyle, swatchStrokeColor } from './color'

// Theme-aware access to the two swatch helpers in color.js, so a component
// painting a doctor's identity colour doesn't have to reach for the theme
// itself at every call site:
//
//   const swatch = useSwatch()
//   <span style={swatch.fill(profile.color_code)} />            // a dot
//   <span style={swatch.fill(hex, { text: true })}>Naidoo</span> // a name pill
//   <div style={{ borderLeftColor: swatch.stroke(hex) }} />      // a colour rail
//
// Outside a ThemeProvider this falls back to the light theme, same as every
// other useTheme() consumer.
export function useSwatch() {
  const { theme } = useTheme()
  return useMemo(() => ({
    fill: (hex, opts) => swatchFillStyle(hex, theme, opts),
    stroke: hex => swatchStrokeColor(hex, theme),
  }), [theme])
}
