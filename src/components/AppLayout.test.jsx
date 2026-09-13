import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The nav bar is the one thing on screen on every page, and its order is a
// deliberate story rather than an accident: where am I, what am I working,
// what am I asking for, who else is there, then me. It has drifted before,
// so it gets a test — one per role, including which entries a role does
// NOT get.
const authState = { profile: { id: 'me', name: 'Ada', surname: 'Doe', is_approved: true, category: 'MO' }, signOut: vi.fn(), isAdmin: false, isLocum: false, isClerk: false }
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../lib/supabase', () => {
  const builder = { select: () => builder, eq: () => builder, then: (res, rej) => Promise.resolve({ count: 0, data: [] }).then(res, rej) }
  return { supabase: { from: () => builder, rpc: () => Promise.resolve({ data: [] }) } }
})
const { default: AppLayout } = await import('./AppLayout')

function navLabels(role) {
  Object.assign(authState, { isAdmin: false, isLocum: false, isClerk: false }, role)
  const { unmount } = render(<MemoryRouter><AppLayout /></MemoryRouter>)
  // The sidebar and the bottom bar render the same list; read the bottom
  // one, which is the phone's primary navigation.
  const bars = screen.getAllByRole('navigation')
  const labels = within(bars[bars.length - 1]).getAllByRole('link').map(a => a.textContent.trim())
  unmount()
  return labels
}

describe('AppLayout nav order', () => {
  it('admin: Dashboard, Roster, Planners, Staff, Account', () => {
    expect(navLabels({ isAdmin: true })).toEqual(['Dashboard', 'Roster', 'Planners', 'Staff', 'Account'])
  })

  it('doctor: the same, with Swaps before Staff', () => {
    expect(navLabels({})).toEqual(['Dashboard', 'Roster', 'Planners', 'Swaps', 'Staff', 'Account'])
  })

  it('locum: Open shifts instead of Planners, and no Swaps', () => {
    expect(navLabels({ isLocum: true })).toEqual(['Dashboard', 'Roster', 'Open shifts', 'Staff', 'Account'])
  })

  it('clerk: read-only, so no Swaps and a singular Planner', () => {
    expect(navLabels({ isClerk: true })).toEqual(['Dashboard', 'Roster', 'Planner', 'Staff', 'Account'])
  })
})
