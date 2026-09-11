import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DARK_THEME, LIGHT_THEME, THEME_STORAGE_KEY } from '../lib/themes'

// The real widget renders a Cloudflare-hosted iframe, so what we hand it is
// the only thing worth asserting. This stands in and reports it back.
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: props => (
    <div data-testid="turnstile" data-theme={props.options?.theme} data-size={props.options?.size} />
  ),
}))

// Both modules come from the same freshly-reset graph: TurnstileWidget reads
// the theme through ThemeContext, and importing the two separately would hand
// it a different context instance than the provider under test.
async function renderAt(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  const [{ ThemeProvider, useTheme }, { default: TurnstileWidget }] = await Promise.all([
    import('../context/ThemeContext'),
    import('./TurnstileWidget'),
  ])
  function Switcher() {
    const { setTheme } = useTheme()
    return <button type="button" onClick={() => setTheme(LIGHT_THEME)}>to light</button>
  }
  render(
    <ThemeProvider>
      <TurnstileWidget onVerify={() => {}} onExpire={() => {}} />
      <Switcher />
    </ThemeProvider>
  )
}

describe('TurnstileWidget', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('follows the app into the dark theme', async () => {
    // Turnstile's own "auto" keys off the OS, not the app, so it showed a
    // dark box on the light forms and would show a white one here.
    await renderAt(DARK_THEME)
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-theme', 'dark')
  })

  it('stays light on the light theme', async () => {
    await renderAt(LIGHT_THEME)
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-theme', 'light')
  })

  it('follows a theme switched while the form is open', async () => {
    const user = userEvent.setup()
    await renderAt(DARK_THEME)
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-theme', 'dark')
    await user.click(screen.getByRole('button', { name: 'to light' }))
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-theme', 'light')
  })

  it('still stretches to the width of the form', async () => {
    await renderAt(DARK_THEME)
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-size', 'flexible')
  })

  it('renders nothing without a site key, rather than blocking the form', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    vi.resetModules()
    await renderAt(LIGHT_THEME)
    expect(screen.queryByTestId('turnstile')).not.toBeInTheDocument()
  })
})
