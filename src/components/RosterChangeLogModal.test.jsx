import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RosterChangeLogModal from './RosterChangeLogModal'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' } }) }))
const fetchRosterBatches = vi.fn()
const undoRosterBatch = vi.fn()
vi.mock('../lib/rosterUndo', async () => {
  const actual = await vi.importActual('../lib/rosterUndo')
  return { ...actual, fetchRosterBatches: (...a) => fetchRosterBatches(...a), undoRosterBatch: (...a) => undoRosterBatch(...a) }
})
const queryRosterChanges = vi.fn()
vi.mock('../lib/changeLog', async () => {
  const actual = await vi.importActual('../lib/changeLog')
  return {
    ...actual,
    queryRosterChanges: (...args) => queryRosterChanges(...args),
    fetchProfilesById: async () => new Map([
      ['admin', { id: 'admin', name: 'Paul', surname: 'Xafis', role: 'admin' }],
      ['jenna', { id: 'jenna', name: 'Jenna', surname: 'Smith', role: 'doctor' }],
      ['musa', { id: 'musa', name: 'Musa', surname: 'Omar', role: 'doctor' }],
    ]),
    fetchAdminOptions: async () => [{ value: 'admin', label: 'Paul Xafis' }],
    fetchDoctorOptions: async () => [
      { value: 'jenna', label: 'Jenna Smith', role: 'doctor' },
      { value: 'musa', label: 'Musa Omar', role: 'doctor' },
    ],
  }
})

const base = { roster_month_id: 'm', entry_date: '2026-11-01', shift_code: 'WE_08', changed_by: 'admin' }
const ROWS = [
  { ...base, id: '1', action: 'assign', profile_id_before: 'jenna', profile_id_after: 'musa', changed_at: '2026-11-20T20:55:00' },
  { ...base, id: '2', action: 'unassign', profile_id_before: 'musa', advertised: true, changed_at: '2026-11-20T20:41:00' },
  { ...base, id: '3', action: 'assign', profile_id_after: 'musa', changed_at: '2026-11-17T12:26:00' },
]

describe('RosterChangeLogModal', () => {
  beforeEach(() => {
    queryRosterChanges.mockReset().mockResolvedValue({ data: ROWS, error: null })
    fetchRosterBatches.mockReset().mockResolvedValue({ batches: [], error: null })
    undoRosterBatch.mockReset().mockResolvedValue({ error: null, batchId: 'undo-1', description: 'undone' })
  })

  it('groups by day, and spells out a replacement as "<taken off> with <put on>"', async () => {
    render(<RosterChangeLogModal rosterMonthId="m" monthLabel="November 2026" onClose={vi.fn()} />)
    const day = await screen.findByRole('region', { name: 'Fri 20 Nov 2026' })
    expect(within(day).getByText('Replaced')).toBeInTheDocument()
    const replaced = within(day).getByText('with').parentElement
    expect(replaced).toHaveTextContent('Jenna Smith with Musa Omar')
    expect(within(day).getAllByText('Sun 1 Nov · WE 08h-20h')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Tue 17 Nov 2026' })).toHaveTextContent('Assigned')
  })

  it('shows a vacated shift with the doctor struck through and the locum-cover tag', async () => {
    render(<RosterChangeLogModal rosterMonthId="m" monthLabel="November 2026" onClose={vi.fn()} />)
    expect(await screen.findByText('Vacated')).toBeInTheDocument()
    expect(screen.getByText('Opened for locum cover')).toBeInTheDocument()
  })

  it('shows the admin as initials, with the full name on tap', async () => {
    const user = userEvent.setup()
    render(<RosterChangeLogModal rosterMonthId="m" monthLabel="November 2026" onClose={vi.fn()} />)
    const badges = await screen.findAllByRole('button', { name: 'Paul Xafis' })
    expect(badges[0]).toHaveTextContent('PX')
    await user.click(badges[0])
    expect(screen.getByRole('tooltip')).toHaveTextContent('Paul Xafis')
  })

  it('one Filter button, Doctor first; ticking two doctors queries changes involving either', async () => {
    const user = userEvent.setup()
    render(<RosterChangeLogModal rosterMonthId="m" monthLabel="November 2026" onClose={vi.fn()} />)
    await screen.findByText('Vacated')
    expect(screen.queryByRole('button', { name: /^Admin$/ })).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Filter' })[0])
    const sections = screen.getAllByRole('button', { name: /^(Doctor|Admin|Change type|Role)/ })
    expect(sections.map(b => b.textContent.trim())).toEqual(['Doctor', 'Admin', 'Change type', 'Role'])

    await user.click(sections[0])
    await user.click(screen.getByRole('checkbox', { name: 'Jenna Smith' }))
    await user.click(screen.getByRole('checkbox', { name: 'Musa Omar' }))
    const last = queryRosterChanges.mock.calls.at(-1)[0]
    expect(last.doctorMatchIds).toEqual(['jenna', 'musa'])
  })
})
