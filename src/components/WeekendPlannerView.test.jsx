import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeekendPlannerView from './WeekendPlannerView'

// Sandbox clock is 2026-08-01 (a Saturday) throughout this session.
let mockAuth = { isAdmin: false, profile: { id: 'p1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('../lib/changeLog', () => ({
  logWeekendPlannerChange: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./WeekendPlannerChangeLogModal', () => ({
  default: ({ onClose }) => <div>ChangeLogStub<button onClick={onClose}>close</button></div>,
}))

const PROFILES = [
  { id: 'p1', name: 'Alice', surname: 'Anderson', category: 'MO' },
  { id: 'p2', name: 'Bob', surname: 'Botha', category: 'Registrar' },
  { id: 'p3', name: 'Carol', surname: 'Cosmo', category: 'COSMO' },
  { id: 'p4', name: 'Dan', surname: 'Della', category: 'COSMOPsych' },
]

// 2026-08-01: only MO (p1) filled — needs planning. Also p1's "My Schedule".
// 2026-08-08: fully covered. Also p1's "My Schedule".
// 2026-08-15/22/29: nothing planned yet.
const ENTRIES = [
  { id: 'e1', weekend_saturday: '2026-08-01', profile_id: 'p1', category: 'MO' },
  { id: 'e2', weekend_saturday: '2026-08-08', profile_id: 'p1', category: 'MO' },
  { id: 'e3', weekend_saturday: '2026-08-08', profile_id: 'p2', category: 'Registrar' },
  { id: 'e4', weekend_saturday: '2026-08-08', profile_id: 'p3', category: 'COSMO' },
  { id: 'e5', weekend_saturday: '2026-08-08', profile_id: 'p4', category: 'COSMOPsych' },
]

// p1 has a pending weekend-exception request for 2026-08-22 — a weekend
// they're NOT rostered for, so it only shows up under "My Requests", not
// "My Schedule".
const MY_WEEKEND_REQUESTS = [
  { id: 'r1', date_from: '2026-08-22', status: 'pending' },
]

const { mockResponses, insertedRows } = vi.hoisted(() => ({ mockResponses: {}, insertedRows: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      let lastArgs = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        insert(args) { method = 'insert'; lastArgs = args; return builder },
        delete() { method = 'delete'; return builder },
        eq() { return builder },
        gte() { return builder },
        lte() { return builder },
        single() { return builder },
        order() { return builder },
        then(resolve, reject) {
          if (method === 'insert') {
            const row = { id: `new-${insertedRows.length}`, ...lastArgs }
            insertedRows.push(row)
            return Promise.resolve({ data: row, error: null }).then(resolve, reject)
          }
          const result = mockResponses[`${table}:${method}`] || { data: null, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

async function showAll(user) {
  await user.click(screen.getByRole('button', { name: 'All' }))
}

describe('WeekendPlannerView', () => {
  beforeEach(() => {
    insertedRows.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    mockResponses['weekend_planner_entries:select'] = { data: ENTRIES, error: null }
    mockResponses['weekend_planner_entries:delete'] = { data: null, error: null }
    mockResponses['leave_requests:select'] = { data: MY_WEEKEND_REQUESTS, error: null }
    mockAuth = { isAdmin: false, profile: { id: 'p1' } }
  })

  it('shows the Next weekend summary card with coverage and "on rotation" status', async () => {
    render(<WeekendPlannerView />)
    const heading = await screen.findByText('Next weekend')
    const card = heading.closest('.card')
    expect(within(card).getByText('2026-08-01 → 2026-08-02')).toBeInTheDocument()
    expect(within(card).getByText(/1 of 4 groups planned/)).toBeInTheDocument()
    expect(within(card).getByText(/Registrar, EC COSMO \/ Intern, OT COSMO \/ Intern still open/)).toBeInTheDocument()
    expect(within(card).getByText(/You.re on rotation this weekend/)).toBeInTheDocument()
  })

  it('defaults to the "My Schedule" filter, leftmost of the chips', async () => {
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')

    const chips = screen.getAllByRole('button', { name: /^(My Schedule|My Requests|All|Needs planning)$/ })
    expect(chips.map(c => c.textContent)).toEqual(['My Schedule', 'My Requests', 'All'])
    expect(screen.getByRole('button', { name: 'My Schedule' })).toHaveClass('bg-accent')

    // Only p1's own two weekends show by default
    expect(screen.getAllByText('2026-08-01 → 2026-08-02')).toHaveLength(2) // next-weekend card + list card
    expect(screen.getByText('2026-08-08 → 2026-08-09')).toBeInTheDocument()
    expect(screen.queryByText('2026-08-15 → 2026-08-16')).not.toBeInTheDocument()
  })

  it('renders one card per weekend in the current month once "All" is selected, flagging incomplete coverage', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)

    const aug8Heading = await screen.findByText('2026-08-08 → 2026-08-09')
    const aug8Card = aug8Heading.closest('.card')
    expect(within(aug8Card).queryByText('Needs planning')).not.toBeInTheDocument() // fully covered

    const aug15Heading = screen.getByText('2026-08-15 → 2026-08-16')
    const aug15Card = aug15Heading.closest('.card')
    expect(within(aug15Card).getByText('Needs planning')).toBeInTheDocument()
  })

  it('cards alternate teal/amber background+text colour by weekend, independent of coverage', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)

    // 2026-08-01 is both the next-weekend card and this month's first list card
    const aug1Card = screen.getAllByText('2026-08-01 → 2026-08-02')[1].closest('.card')
    const aug8Card = screen.getByText('2026-08-08 → 2026-08-09').closest('.card')
    const aug1IsAccent = aug1Card.className.includes('bg-accent-tint')
    const aug8IsAccent = aug8Card.className.includes('bg-accent-tint')
    expect(aug1IsAccent).not.toBe(aug8IsAccent)
    expect(aug1Card.className.includes('bg-flagAmber-bg') || aug1IsAccent).toBe(true)
    expect(aug8Card.className.includes('bg-flagAmber-bg') || aug8IsAccent).toBe(true)
  })

  it('"Needs planning" no longer overrides the background — a rose pillbox and rose open-slot counts instead', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)

    const aug15Card = screen.getByText('2026-08-15 → 2026-08-16').closest('.card')
    // still themed by parity, not overridden to a flat amber "warning" card
    expect(aug15Card.className.includes('bg-accent-tint') || aug15Card.className.includes('bg-flagAmber-bg')).toBe(true)
    expect(within(aug15Card).getByText('Needs planning')).toHaveClass('bg-rose-light', 'text-rose-dark')
    for (const el of within(aug15Card).getAllByText('1 open')) {
      expect(el).toHaveClass('text-rose-dark')
    }
  })

  it("filled surnames and the admin's +/x controls use the weekend's parity text colour", async () => {
    mockAuth = { isAdmin: true, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)

    const aug8Card = screen.getByText('2026-08-08 → 2026-08-09').closest('.card')
    const scheme = aug8Card.className.includes('bg-accent-tint') ? 'text-accent' : 'text-flagAmber'
    expect(within(aug8Card).getByText('Anderson').closest('span')).toHaveClass(scheme)
    expect(within(aug8Card).getByRole('button', { name: 'Remove Anderson from 2026-08-08' })).toHaveClass(scheme)

    const aug15Card = screen.getByText('2026-08-15 → 2026-08-16').closest('.card')
    const aug15Scheme = aug15Card.className.includes('bg-accent-tint') ? 'text-accent' : 'text-flagAmber'
    const addButtons = within(aug15Card).getAllByRole('button', { name: '+' })
    expect(addButtons[0]).toHaveClass(aug15Scheme)
  })

  it('"Needs planning" filter (admin-only) hides fully-covered weekends', async () => {
    mockAuth = { isAdmin: true, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')

    await user.click(screen.getByRole('button', { name: 'Needs planning' }))
    expect(screen.queryByText('2026-08-08 → 2026-08-09')).not.toBeInTheDocument()
    expect(screen.getByText('2026-08-15 → 2026-08-16')).toBeInTheDocument()
  })

  it('non-admin: "Needs planning" filter does not exist', async () => {
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    expect(screen.queryByRole('button', { name: 'Needs planning' })).not.toBeInTheDocument()
  })

  it('"My Schedule" filter shows only weekends the signed-in doctor is assigned to', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)
    await user.click(screen.getByRole('button', { name: 'My Schedule' }))

    expect(screen.getByText('2026-08-08 → 2026-08-09')).toBeInTheDocument() // p1 assigned
    expect(screen.queryByText('2026-08-15 → 2026-08-16')).not.toBeInTheDocument() // nobody assigned
  })

  it('"My Requests" filter shows weekends with the doctor\'s own weekend-exception request, with a status badge', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')

    await user.click(screen.getByRole('button', { name: 'My Requests' }))
    const aug22Heading = await screen.findByText('2026-08-22 → 2026-08-23')
    expect(screen.queryByText('2026-08-08 → 2026-08-09')).not.toBeInTheDocument() // in My Schedule, not My Requests
    expect(within(aug22Heading.closest('.card')).getByText('Exception pending')).toBeInTheDocument()
  })

  it('month navigation moves forward and the Previous button is disabled on the starting (current) month', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next month' }))

    expect(await screen.findByText('September 2026')).toBeInTheDocument()
    expect(screen.getByText('2026-09-05 → 2026-09-06')).toBeInTheDocument()
    expect(screen.queryByText('2026-08-08 → 2026-08-09')).not.toBeInTheDocument()
  })

  it('non-admin: no add/remove controls on any card', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)
    await screen.findByText('2026-08-08 → 2026-08-09')
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument()
  })

  it('displays surnames only, not full names, in the grid', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)
    const aug8Card = (await screen.findByText('2026-08-08 → 2026-08-09')).closest('.card')
    expect(within(aug8Card).getByText('Anderson')).toBeInTheDocument()
    expect(within(aug8Card).queryByText('Alice Anderson')).not.toBeInTheDocument()
  })

  it('admin: can remove an assigned doctor from a weekend', async () => {
    mockAuth = { isAdmin: true, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)
    await screen.findByRole('button', { name: 'Remove Anderson from 2026-08-01' })

    await user.click(screen.getByRole('button', { name: 'Remove Anderson from 2026-08-01' }))
    expect(screen.queryByRole('button', { name: 'Remove Anderson from 2026-08-01' })).not.toBeInTheDocument()
  })

  it('admin: can add a doctor to an open slot via the picker', async () => {
    mockAuth = { isAdmin: true, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')
    await showAll(user)
    const aug15Heading = await screen.findByText('2026-08-15 → 2026-08-16')
    const aug15Card = aug15Heading.closest('.card')

    const addButtons = within(aug15Card).getAllByRole('button', { name: '+' })
    await user.click(addButtons[0]) // MO row is first
    await user.selectOptions(within(aug15Card).getByRole('combobox'), 'p1')

    expect(await within(aug15Card).findByText('Anderson')).toBeInTheDocument()
  })
})
