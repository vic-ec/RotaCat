import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './LoginPage'

const { signIn, desktop } = vi.hoisted(() => ({
  signIn: vi.fn(),
  desktop: { current: true },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ signIn }) }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { resetPasswordForEmail: vi.fn() } } }))
vi.mock('../lib/useIsDesktop', () => ({ useIsDesktop: () => desktop.current }))
vi.mock('../lib/useAuthMascot', () => ({ useAuthMascot: () => 'mascot.png' }))
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  )
}

// Both landings (phone sheet and tablet/desktop shell) are in the DOM at
// once and CSS decides which shows, so queries scope to the one in play.
const inlineForm = () => document.querySelector('form:has(#email)')
const signInDialog = () => document.querySelector('[aria-labelledby="signin-title"]')
const forgotDialog = () => document.querySelector('[aria-labelledby="forgot-title"]')

describe('LoginPage — desktop (lg and up)', () => {
  beforeEach(() => {
    desktop.current = true
    signIn.mockReset()
  })

  it('mounts the sign-in form inline and never the sign-in modal', () => {
    renderPage()
    expect(inlineForm()).not.toBeNull()
    expect(signInDialog()).toBeNull()
    // The spec's local ids, each exactly once.
    expect(document.querySelectorAll('#email')).toHaveLength(1)
    expect(document.querySelectorAll('#password')).toHaveLength(1)
  })

  it('orders the controls Email → Password → Show → Forgot → Sign in → Create an account', () => {
    renderPage()
    const focusable = [...inlineForm().querySelectorAll('input, button, a')]
    expect(focusable.map(el => el.id || el.getAttribute('aria-label') || el.textContent.trim())).toEqual([
      'email', 'password', 'Show password', 'Forgot password?', 'Sign in', 'Create an account',
    ])
  })

  it('gives the eye toggle its pressed state and the field it controls', async () => {
    const user = userEvent.setup()
    renderPage()
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'password')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.getElementById('password')).toHaveAttribute('type', 'text')
  })

  it('describes an invalid email with its own error message', async () => {
    const user = userEvent.setup()
    renderPage()
    const email = document.getElementById('email')
    await user.type(email, 'paul@exampl')
    await user.tab()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', 'email-error')
    expect(document.getElementById('email-error')).toHaveTextContent('Enter a valid email address.')
  })

  it('on wrong credentials: announces the banner, flags both fields and puts focus in the password', async () => {
    const user = userEvent.setup()
    signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    renderPage()
    const alert = document.querySelector('[role="alert"]')
    expect(alert).toBeEmptyDOMElement()
    expect(alert).toHaveAttribute('aria-live', 'assertive')

    await user.type(document.getElementById('email'), 'paul@example.com')
    await user.type(document.getElementById('password'), 'wrongpass')
    await user.click(within(inlineForm()).getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(alert).toHaveTextContent('Incorrect email or password.'))
    expect(document.getElementById('email')).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById('password')).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(document.getElementById('password'))
    expect(signIn).toHaveBeenCalledWith('paul@example.com', 'wrongpass', '')

    // Editing either field withdraws the red outlines.
    await user.type(document.getElementById('password'), 'x')
    expect(document.getElementById('email')).toHaveAttribute('aria-invalid', 'false')
  })

  it('marks the form busy and keeps the submit button in the tab order while signing in', async () => {
    const user = userEvent.setup()
    let release
    signIn.mockReturnValue(new Promise(resolve => { release = resolve }))
    renderPage()
    await user.type(document.getElementById('email'), 'paul@example.com')
    await user.type(document.getElementById('password'), 'secret')
    await user.click(within(inlineForm()).getByRole('button', { name: 'Sign in' }))

    const button = within(inlineForm()).getByRole('button', { name: /Signing in…/ })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(inlineForm()).toHaveAttribute('aria-busy', 'true')

    release({ error: null })
    await screen.findByText('Dashboard')
  })

  it('keeps the closed Forgot-password dialog inert, and makes the page inert while it is open', async () => {
    const user = userEvent.setup()
    renderPage()
    const forgotWrapper = forgotDialog().parentElement
    expect(forgotWrapper).toHaveAttribute('inert')
    expect(forgotDialog()).toHaveAttribute('role', 'dialog')
    expect(forgotDialog()).toHaveAttribute('aria-modal', 'true')

    await user.click(within(inlineForm()).getByRole('button', { name: 'Forgot password?' }))
    expect(forgotWrapper).not.toHaveAttribute('inert')
    expect(inlineForm().closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Reset your password' }).id).toBe('forgot-title')

    await user.keyboard('{Escape}')
    expect(forgotWrapper).toHaveAttribute('inert')
    expect(inlineForm().closest('[inert]')).toBeNull()
  })
})

describe('LoginPage — below lg', () => {
  beforeEach(() => {
    desktop.current = false
    signIn.mockReset()
  })

  it('keeps the form inside a dialog that is inert until the Welcome button opens it', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(document.querySelectorAll('#email')).toHaveLength(1)
    const dialog = signInDialog()
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog.parentElement).toHaveAttribute('inert')
    expect(screen.getByRole('heading', { name: 'Sign in to your account', hidden: true }).id).toBe('signin-title')

    // Two landings, one per layout, each with a "Sign in" opener.
    const openers = screen.getAllByRole('button', { name: 'Sign in' }).filter(b => b.type === 'button')
    await user.click(openers[0])
    expect(dialog.parentElement).not.toHaveAttribute('inert')
    expect(openers[0].closest('[inert]')).not.toBeNull()
    expect(document.activeElement).toBe(document.getElementById('email'))

    await user.keyboard('{Escape}')
    expect(dialog.parentElement).toHaveAttribute('inert')
    expect(document.activeElement).toBe(openers[0])
  })

  it('uses real headings for the Welcome landings', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { name: 'Welcome' }).length).toBeGreaterThanOrEqual(1)
  })
})
