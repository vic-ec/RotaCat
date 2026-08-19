import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import UpcomingBirthdays from './UpcomingBirthdays'

// The component renders nothing at all when the window is empty, so
// "nothing appeared" can't be awaited with findBy* — flush the mocked
// fetch's microtask inside act() and assert on the settled DOM instead.
async function waitForFetch() {
  await act(async () => { await Promise.resolve() })
}

let mockAuth = { profile: { id: 'me' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const { mockProfiles } = vi.hoisted(() => ({ mockProfiles: { data: [], error: null } }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from() {
      const builder = {
        select() { return builder },
        not() { return builder },
        eq() { return builder },
        then(resolve, reject) {
          return Promise.resolve(mockProfiles).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

// "Today" is pinned via a mocked todayStr() rather than the real system
// clock — a "days until next occurrence" calculation is date-sensitive, and
// a test asserting against whatever today happens to be would silently rot
// as real time passes (this is exactly what broke WeekendPlannerView's date
// fixtures — see that file's tests for the same lesson learned the hard
// way). parseLocalDate is left as the real implementation since it's pure.
vi.mock('../lib/dateRange', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, todayStr: () => '2026-08-02' } // 2 August 2026
})

describe('UpcomingBirthdays', () => {
  beforeEach(() => {
    mockAuth = { profile: { id: 'me' } }
    mockProfiles.data = []
    mockProfiles.error = null
  })

  it('renders nothing until the fetch resolves', () => {
    mockProfiles.data = []
    const { container } = render(<UpcomingBirthdays />)
    // Synchronously (before the mocked promise resolves), nothing is rendered.
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing at all when nobody has a birthday in the next 30 days', async () => {
    mockProfiles.data = [{ id: 'p1', name: 'Far', surname: 'Off', birthday: '2000-01-01' }] // ~5 months from Aug 2
    const { container } = render(<UpcomingBirthdays />)
    await waitForFetch()
    expect(container).toBeEmptyDOMElement()
  })

  it('lists upcoming birthdays sorted by proximity, formatted as day + month', async () => {
    mockProfiles.data = [
      { id: 'p1', name: 'Later', surname: 'Person', birthday: '2000-08-20' }, // 18 days out
      { id: 'p2', name: 'Sooner', surname: 'Person', birthday: '2000-08-10' }, // 8 days out
    ]
    render(<UpcomingBirthdays />)

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Sooner Person')
    expect(items[0]).toHaveTextContent('10 August')
    expect(items[1]).toHaveTextContent('Later Person')
    expect(items[1]).toHaveTextContent('20 August')
  })

  it('marks a same-day birthday as "Today" instead of the date', async () => {
    mockProfiles.data = [{ id: 'p1', name: 'Birthday', surname: 'Person', birthday: '2000-08-02' }]
    render(<UpcomingBirthdays />)
    expect(await screen.findByText('Today')).toBeInTheDocument()
  })

  it('wraps a birthday that already passed this year around to next year (falls outside the window)', async () => {
    // Today is 2 August 2026; 1 July already passed this year — should NOT show
    mockProfiles.data = [{ id: 'p1', name: 'Passed', surname: 'Already', birthday: '2000-07-01' }]
    const { container } = render(<UpcomingBirthdays />)
    await waitForFetch()
    expect(container).toBeEmptyDOMElement()
  })

  it('ignores rows with no birthday set', async () => {
    mockProfiles.data = [{ id: 'p1', name: 'No', surname: 'Birthday', birthday: null }]
    const { container } = render(<UpcomingBirthdays />)
    await waitForFetch()
    expect(container).toBeEmptyDOMElement()
  })
})
