import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

// The hero's ground is a token, not a component decision, so this reads the
// stylesheet: the failure being guarded against is the two themes drifting
// until the hero and the sign-in sheet are the same colour again.
const css = fs.readFileSync('src/styles/index.css', 'utf8')
const hero = fs.readFileSync('src/components/AuthHero.jsx', 'utf8')
const mobileHero = fs.readFileSync('src/components/MobileAuthHero.jsx', 'utf8')

function token(name, block) {
  const scope = block === 'dark'
    ? css.slice(css.indexOf(':root[data-theme="neutral-dark"]'))
    : css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme='))
  const m = scope.match(new RegExp(`--color-${name}:\\s*([\\d\\s]+);`))
  return m ? m[1].trim().split(/\s+/).map(Number) : null
}
const contrast = (a, b) => {
  const lum = c => {
    const [r, g, bl] = c.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('the auth hero has a ground of its own', () => {
  it('both heroes paint it, rather than borrowing canvas-raised', () => {
    expect(hero).toContain('bg-auth-hero')
    expect(mobileHero).toContain('bg-auth-hero')
  })

  it('is declared in both themes, so neither renders unstyled', () => {
    expect(token('auth-hero', 'light')).not.toBeNull()
    expect(token('auth-hero', 'dark')).not.toBeNull()
  })

  it('leaves the light theme exactly as it was — white, like canvas-raised', () => {
    expect(token('auth-hero', 'light')).toEqual(token('canvas-raised', 'light'))
  })

  it('separates the hero from the sign-in sheet on the dark theme', () => {
    // The bug: hero #1D2F2B against sheet #1F332E was 1.04:1 — indisting-
    // uishable, so the two read as one surface. #0A100E against the same
    // sheet measures 1.44:1, which is a plain edge on screen. The bar is set
    // below that rather than at it, so a small future tweak to either colour
    // is allowed and a slide back toward one surface is not.
    const ratio = contrast(token('auth-hero', 'dark'), token('accent-panel', 'dark'))
    expect(ratio).toBeGreaterThan(1.3)
  })

  it('puts the dark hero on the page ground, so the mascot sits on near-black', () => {
    expect(token('auth-hero', 'dark')).toEqual(token('auth-ground', 'dark'))
  })
})
