import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './ThemeContext'
import { DARK_THEME, LIGHT_THEME, SYSTEM_THEME, THEME_STORAGE_KEY } from '../lib/themes'

// jsdom has no matchMedia at all, so the device preference is stubbed here
// rather than mocked out — these tests are entirely about what the app does
// with that answer. `listeners` is what lets a test flip the OS mid-render,
// which is the whole point of following the device rather than reading it
// once at boot.
let listeners = []
function stubPrefersDark(matches) {
  listeners = []
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: query === '(prefers-color-scheme: dark)' ? matches : false,
    media: query,
    addEventListener: (_event, handler) => listeners.push(handler),
    removeEventListener: (_event, handler) => { listeners = listeners.filter(l => l !== handler) },
  }))
}
function flipDeviceTo(matches) {
  act(() => listeners.forEach(handler => handler({ matches })))
}

function Probe() {
  const { theme, choice, setTheme } = useTheme()
  return (
    <>
      <span data-testid="applied">{theme}</span>
      <span data-testid="choice">{choice}</span>
      <button type="button" onClick={() => setTheme(LIGHT_THEME)}>pin light</button>
      <button type="button" onClick={() => setTheme(DARK_THEME)}>pin dark</button>
      <button type="button" onClick={() => setTheme(SYSTEM_THEME)}>match device</button>
    </>
  )
}

const renderProbe = () => render(<ThemeProvider><Probe /></ThemeProvider>)
const applied = () => screen.getByTestId('applied').textContent
const stored = () => localStorage.getItem(THEME_STORAGE_KEY)

describe('ThemeProvider', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    delete window.matchMedia
    delete document.documentElement.dataset.theme
  })

  it('follows the device on a first visit, with nothing stored', () => {
    stubPrefersDark(true)
    renderProbe()
    expect(applied()).toBe(DARK_THEME)
    expect(screen.getByTestId('choice')).toHaveTextContent(SYSTEM_THEME)
    expect(document.documentElement.dataset.theme).toBe(DARK_THEME)
  })

  it('stays light on a device with no dark preference', () => {
    stubPrefersDark(false)
    renderProbe()
    expect(applied()).toBe(LIGHT_THEME)
    // The light theme is the absence of the attribute, not a value on it.
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('flips live when the device switches, without a reload', () => {
    stubPrefersDark(false)
    renderProbe()
    expect(applied()).toBe(LIGHT_THEME)
    flipDeviceTo(true)
    expect(applied()).toBe(DARK_THEME)
    expect(document.documentElement.dataset.theme).toBe(DARK_THEME)
  })

  it('a pinned palette wins over the device, and ignores it flipping', async () => {
    stubPrefersDark(true)
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'pin light' }))
    expect(applied()).toBe(LIGHT_THEME)
    flipDeviceTo(false)
    flipDeviceTo(true)
    expect(applied()).toBe(LIGHT_THEME)
  })

  it('stores the choice rather than the palette it resolved to', async () => {
    stubPrefersDark(true)
    renderProbe()
    expect(stored()).toBe(SYSTEM_THEME) // not DARK_THEME, which is what it is showing

    await userEvent.click(screen.getByRole('button', { name: 'pin light' }))
    expect(stored()).toBe(LIGHT_THEME)

    await userEvent.click(screen.getByRole('button', { name: 'match device' }))
    expect(stored()).toBe(SYSTEM_THEME)
    expect(applied()).toBe(DARK_THEME)
  })

  it('honours a palette pinned in an earlier session', () => {
    localStorage.setItem(THEME_STORAGE_KEY, DARK_THEME)
    stubPrefersDark(false)
    renderProbe()
    expect(applied()).toBe(DARK_THEME)
    expect(screen.getByTestId('choice')).toHaveTextContent(DARK_THEME)
  })

  it('defers to the device when the stored value is not one we know', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'midnight-teal') // e.g. a theme since renamed
    stubPrefersDark(true)
    renderProbe()
    expect(applied()).toBe(DARK_THEME)
    expect(screen.getByTestId('choice')).toHaveTextContent(SYSTEM_THEME)
  })

  it('falls back to light where matchMedia does not exist', () => {
    renderProbe() // no stub: window.matchMedia is undefined, as in an old browser
    expect(applied()).toBe(LIGHT_THEME)
  })
})
