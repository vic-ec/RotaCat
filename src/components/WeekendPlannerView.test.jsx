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

// 2026-08-01: only MO (p1) filled — needs planning.
// 2026-08-08: fully covered.
// 2026-08-15/22/29: nothing planned yet.
const ENTRIES = [
  { id: 'e1', weekend_saturday: '2026-08-01', profile_id: 'p1', category: 'MO' },
  { id: 'e2', weekend_saturday: '2026-08-08', profile_id: 'p1', category: 'MO' },
  { id: 'e3', weekend_saturday: '2026-08-08', profile_id: 'p2', category: 'Registrar' },
  { id: 'e4', weekend_saturday: '2026-08-08', profile_id: 'p3', category: 'COSMO' },
  { id: 'e5', weekend_saturday: '2026-08-08', profile_id: 'p4', category: 'COSMOPsych' },
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

describe('WeekendPlannerView', () => {
  beforeEach(() => {
    insertedRows.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    mockResponses['weekend_planner_entries:select'] = { data: ENTRIES, error: null }
    mockResponses['weekend_planner_entries:delete'] = { data: null, error: null }
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

  it('renders one card per weekend in the current month, flagging incomplete coverage', async () => {
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')

    // 2026-08-01 is both "next weekend" and this month's first card — appears twice
    expect(screen.getAllByText('2026-08-01 → 2026-08-02')).toHaveLength(2)
    const aug8Heading = await screen.findByText('2026-08-08 → 2026-08-09')
    const aug8Card = aug8Heading.closest('.card')
    expect(within(aug8Card).queryByText('Needs planning')).not.toBeInTheDocument() // fully covered

    const aug15Heading = screen.getByText('2026-08-15 → 2026-08-16')
    const aug15Card = aug15Heading.closest('.card')
    expect(within(aug15Card).getByText('Needs planning')).toBeInTheDocument()
  })

  it('"Needs planning" filter hides fully-covered weekends', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')

    await user.click(screen.getByRole('button', { name: 'Needs planning' }))
    expect(screen.queryByText('2026-08-08 → 2026-08-09')).not.toBeInTheDocument()
    expect(screen.getByText('2026-08-15 → 2026-08-16')).toBeInTheDocument()
  })

  it('"My rotation" filter shows only weekends the signed-in doctor is assigned to', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')

    await user.click(screen.getByRole('button', { name: 'My rotation' }))
    expect(screen.getByText('2026-08-08 → 2026-08-09')).toBeInTheDocument() // p1 assigned
    expect(screen.queryByText('2026-08-15 → 2026-08-16')).not.toBeInTheDocument() // nobody assigned
  })

  it('month navigation moves forward and the Previous button is disabled on the starting (current) month', async () => {
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByText('August 2026')

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next month' }))

    expect(await screen.findByText('September 2026')).toBeInTheDocument()
    expect(screen.getByText('2026-09-05 → 2026-09-06')).toBeInTheDocument()
    expect(screen.queryByText('2026-08-08 → 2026-08-09')).not.toBeInTheDocument()
  })

  it('non-admin: no add/remove controls on any card', async () => {
    render(<WeekendPlannerView />)
    await screen.findByText('2026-08-08 → 2026-08-09')
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument()
  })

  it('admin: can remove an assigned doctor from a weekend', async () => {
    mockAuth = { isAdmin: true, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    await screen.findByRole('button', { name: 'Remove Anderson from 2026-08-01' })

    await user.click(screen.getByRole('button', { name: 'Remove Anderson from 2026-08-01' }))
    expect(screen.queryByRole('button', { name: 'Remove Anderson from 2026-08-01' })).not.toBeInTheDocument()
  })

  it('admin: can add a doctor to an open slot via the picker', async () => {
    mockAuth = { isAdmin: true, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    render(<WeekendPlannerView />)
    const aug15Heading = await screen.findByText('2026-08-15 → 2026-08-16')
    const aug15Card = aug15Heading.closest('.card')

    const addButtons = within(aug15Card).getAllByRole('button', { name: '+' })
    await user.click(addButtons[0]) // MO row is first
    await user.selectOptions(within(aug15Card).getByRole('combobox'), 'p1')

    expect(await within(aug15Card).findByText('Alice Anderson')).toBeInTheDocument()
  })
})
