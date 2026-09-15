import { describe, it, expect } from 'vitest'
import {
  AVATAR_COLOR_PALETTE, contrastRatio, swatchEdgeColor, swatchFillStyle, swatchStrokeColor,
} from './color'

const DARK = 'neutral-dark'
const DARK_GROUND = '#1D2F2B' // --color-canvas-raised on the dark theme
const LIGHT_GROUND = '#FFFFFF'

describe('swatchEdgeColor', () => {
  it('outlines a colour that all but disappears into the dark theme', () => {
    // #182C61 on the dark theme's raised surface is 1.05:1 — the pill in the
    // screenshot that prompted this.
    expect(contrastRatio('#182C61', DARK_GROUND)).toBeLessThan(1.1)
    const edge = swatchEdgeColor('#182C61', DARK)
    expect(edge).not.toBeNull()
    expect(contrastRatio(edge, DARK_GROUND)).toBeGreaterThanOrEqual(3)
  })

  it('outlines a colour that all but disappears into Daylight', () => {
    const edge = swatchEdgeColor('#55EFC4', 'light')
    expect(edge).not.toBeNull()
    expect(contrastRatio(edge, LIGHT_GROUND)).toBeGreaterThanOrEqual(3)
  })

  it('leaves a colour that already stands clear of the page alone', () => {
    expect(swatchEdgeColor('#E17055', 'light')).toBeNull()
    expect(swatchEdgeColor('#E17055', DARK)).toBeNull()
  })

  it('outlines the two themes at opposite ends of the palette', () => {
    // Dark colours are the dark theme's problem; light ones are Daylight's,
    // and neither set is the other's.
    const onDark = AVATAR_COLOR_PALETTE.filter(hex => swatchEdgeColor(hex, DARK))
    const onLight = AVATAR_COLOR_PALETTE.filter(hex => swatchEdgeColor(hex, 'light'))
    expect(onDark.length).toBeGreaterThan(0)
    expect(onLight.length).toBeGreaterThan(0)
    expect(onDark.filter(hex => onLight.includes(hex))).toEqual([])
    // A rim on every swatch would be noise, not a fix.
    expect(onDark.length + onLight.length).toBeLessThan(AVATAR_COLOR_PALETTE.length / 2)
  })

  it('reaches 3:1 for every palette colour it decides to outline', () => {
    for (const [theme, ground] of [[DARK, DARK_GROUND], ['light', LIGHT_GROUND]]) {
      for (const hex of AVATAR_COLOR_PALETTE) {
        const edge = swatchEdgeColor(hex, theme)
        if (edge) expect(contrastRatio(edge, ground)).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('keeps the rim distinguishable from the fill it sits inside', () => {
    for (const hex of AVATAR_COLOR_PALETTE) {
      const edge = swatchEdgeColor(hex, DARK)
      if (edge) expect(contrastRatio(edge, hex)).toBeGreaterThan(1.5)
    }
  })

  it('treats an unknown theme as the light one, and survives a missing colour', () => {
    expect(swatchEdgeColor('#55EFC4', undefined)).toBe(swatchEdgeColor('#55EFC4', 'light'))
    expect(swatchEdgeColor(null, DARK)).toBeNull()
    expect(swatchEdgeColor('', DARK)).toBeNull()
  })
})

describe('swatchFillStyle', () => {
  it('keeps the fill exactly as chosen, and rims it only where needed', () => {
    expect(swatchFillStyle('#182C61', DARK)).toEqual({
      backgroundColor: '#182C61',
      boxShadow: `inset 0 0 0 1px ${swatchEdgeColor('#182C61', DARK)}`,
    })
    expect(swatchFillStyle('#182C61', 'light')).toEqual({ backgroundColor: '#182C61' })
  })

  it('adds readable text only when asked', () => {
    expect(swatchFillStyle('#182C61', DARK, { text: true }).color).toBe('#FFFFFF')
    expect(swatchFillStyle('#FDCB6E', 'light', { text: true }).color).toBe('#111827')
    expect(swatchFillStyle('#FDCB6E', 'light').color).toBeUndefined()
  })
})

describe('swatchStrokeColor', () => {
  it('brightens a stroke that would vanish, and passes the rest through', () => {
    expect(swatchStrokeColor('#182C61', DARK)).toBe(swatchEdgeColor('#182C61', DARK))
    expect(swatchStrokeColor('#E17055', DARK)).toBe('#E17055')
  })
})
