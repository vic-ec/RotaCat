import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveAuditReport from './LeaveAuditReport'

const { mockResponses } = vi.hoisted(() => ({ mockResponses: {} }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select() { method = 'select'; return builder },
        eq() { return builder },
        gte() { return builder },
        lte() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

const PROFILES = [
  { id: 'p1', name: 'Ada', surname: 'Zephyr', category: 'MO', is_active: true },
  { id: 'p2', name: 'Bo', surname: 'Adams', category: 'Registrar', is_active: true },
  { id: 'p3', name: 'Cy', surname: 'Consult', category: 'Consultant', is_active: false },
]

const LEAVE_REQUESTS = [
  { id: 'r1', profile_id: 'p1', leave_type: 'annual', date_from: '2026-03-10', date_to: '2026-03-14', annual_leave_days: 5, status: 'approved' },
  { id: 'r2', profile_id: 'p2', leave_type: 'sick', date_from: '2026-02-01', date_to: '2026-02-02', status: 'approved' },
  { id: 'r3', profile_id: 'p1', leave_type: 'study', date_from: '2026-04-01', date_to: '2026-04-02', status: 'approved' },
]

async function openFilters(user) {
  await user.click(screen.getByRole('button', { name: 'Filters' }))
}

describe('LeaveAuditReport (admin HR-audit view)', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    mockResponses['leave_requests:select'] = { data: LEAVE_REQUESTS, error: null }
  })

  it('lists every leave-eligible doctor sorted by surname, including one with zero leave in range', async () => {
    render(<LeaveAuditReport />)

    const rows = await screen.findAllByRole('row')
    // header + 3 doctor rows
    expect(rows).toHaveLength(4)
    expect(within(rows[1]).getByText('Adams, Bo')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Consult, Cy')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Zephyr, Ada')).toBeInTheDocument()
    // Consultant has no leave requests at all — still shown, with zeroes across annual/special/sick/total
    expect(within(rows[2]).getAllByText('0')).toHaveLength(4)
  })

  it('shows Consultant (not "Other") as the category label for the Other column', async () => {
    render(<LeaveAuditReport />)
    const rows = await screen.findAllByRole('row')
    expect(within(rows[2]).getByText('Consultant')).toBeInTheDocument()
    expect(within(rows[2]).queryByText('Other')).not.toBeInTheDocument()
  })

  it('filter controls are tucked behind a Filter button, not shown by default', async () => {
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr, Ada')
    expect(screen.queryByText('All categories')).not.toBeInTheDocument()
    expect(screen.queryByText('All doctors')).not.toBeInTheDocument()
  })

  it('narrows the table when a category filter is applied, via the Filter panel', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr, Ada')

    await openFilters(user)
    await user.click(screen.getByText('All categories'))
    await user.click(await screen.findByRole('option', { name: 'MO' }))

    expect(screen.getByText('Zephyr, Ada')).toBeInTheDocument()
    expect(screen.queryByText('Adams, Bo')).not.toBeInTheDocument()
    expect(screen.queryByText('Consult, Cy')).not.toBeInTheDocument()
  })

  it('narrows the table with the Status filter (active/inactive)', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr, Ada')

    await openFilters(user)
    await user.click(screen.getByText('All statuses'))
    await user.click(await screen.findByRole('option', { name: 'Inactive' }))

    expect(screen.getByText('Consult, Cy')).toBeInTheDocument()
    expect(screen.queryByText('Zephyr, Ada')).not.toBeInTheDocument()
    expect(screen.queryByText('Adams, Bo')).not.toBeInTheDocument()
  })

  it('narrows totals with the Leave type filter', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    const rows = await screen.findAllByRole('row')
    // Ada has 5 annual + 2 study (special) days = 7 total before filtering
    expect(within(rows.find(r => within(r).queryByText('Zephyr, Ada'))).getByText('7')).toBeInTheDocument()

    await openFilters(user)
    await user.click(screen.getByText('All leave types'))
    await user.click(await screen.findByRole('option', { name: 'Study leave' }))

    const filteredRows = screen.getAllByRole('row')
    const adaRow = filteredRows.find(r => within(r).queryByText('Zephyr, Ada'))
    // Special bucket AND the total both read 2 now — only the study-leave days count
    expect(within(adaRow).getAllByText('2')).toHaveLength(2)
    expect(within(adaRow).getAllByText('0')).toHaveLength(2) // annual + sick buckets
  })

  it('shows an active-filter count badge and clears filters', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr, Ada')

    await openFilters(user)
    await user.click(screen.getByText('All categories'))
    await user.click(await screen.findByRole('option', { name: 'MO' }))

    expect(screen.getByRole('button', { name: 'Filters' })).toHaveTextContent('1')
    await user.click(screen.getByText('Clear filters'))
    expect(screen.getByText('Adams, Bo')).toBeInTheDocument() // Registrar is back
  })

  it('drills down to one doctor\'s individual requests when selected', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr, Ada')

    await openFilters(user)
    await user.click(screen.getByText('All doctors'))
    await user.click(await screen.findByRole('option', { name: 'Zephyr, Ada' }))

    expect(await screen.findByText('Individual requests in range')).toBeInTheDocument()
    expect(screen.getByText(/Annual leave — 2026-03-10 → 2026-03-14/)).toBeInTheDocument()
    expect(screen.getByText('5 total days (5 annual leave)')).toBeInTheDocument()
  })
})
