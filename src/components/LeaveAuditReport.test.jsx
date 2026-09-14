import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveAuditReport from './LeaveAuditReport'
import { AUDIT_LEAVE_COLUMNS } from '../lib/leaveAudit'

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

// Opens the single Filter button and expands one dimension's group
// (Category/Doctor/Status/Leave type), same FilterPanel pattern as Staff.
async function openGroup(user, groupLabel) {
  await user.click(screen.getByRole('button', { name: 'Filter' }))
  await user.click(screen.getByRole('button', { name: groupLabel }))
}

async function pickOption(user, optionLabel) {
  await user.click(await screen.findByRole('checkbox', { name: optionLabel }))
}

describe('LeaveAuditReport (admin HR-audit view)', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    mockResponses['leave_requests:select'] = { data: LEAVE_REQUESTS, error: null }
  })

  it('lists every leave-eligible doctor, including one with zero leave in range', async () => {
    render(<LeaveAuditReport />)

    const rows = await screen.findAllByRole('row')
    // header + 3 doctor rows
    expect(rows).toHaveLength(4)
    // MO, then Registrar, then everything else — Hours Summary's own default
    // sort, which this table now shares (see src/lib/doctorSort.js).
    expect(within(rows[1]).getByText('Zephyr')).toBeInTheDocument() // MO
    expect(within(rows[2]).getByText('Adams')).toBeInTheDocument() // Registrar
    expect(within(rows[3]).getByText('Consult')).toBeInTheDocument() // Consultant
    // Consultant has no leave requests at all — still shown, with a zero in
    // every leave column plus the total.
    expect(within(rows[3]).getAllByText('0')).toHaveLength(AUDIT_LEAVE_COLUMNS.length + 1)
  })

  it('sizes every leave column identically, via a fixed-layout colgroup', async () => {
    // Fifteen columns at the same width is the one thing auto layout cannot
    // do — a specified width there is a floor, so each column grows to its
    // own header word and the slack lands on the widest column. jsdom lays
    // nothing out, so this guards the mechanism: table-fixed, one col per
    // leave column at a shared width, and a last col with none so it takes
    // the leftover.
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    render(<LeaveAuditReport />)
    await screen.findByText('Adams')

    const table = document.querySelector('table')
    expect(table.className).toContain('table-fixed')
    const cols = [...table.querySelectorAll('colgroup col')]
    // Doctor + one per leave type + Total + spacer.
    expect(cols).toHaveLength(AUDIT_LEAVE_COLUMNS.length + 3)
    const widths = new Set(cols.slice(1, -1).map(c => c.className))
    expect(widths.size).toBe(1)
    expect(cols[cols.length - 1].className).toBe('')
  })

  it('ends every row with the spacer cell that takes the table\'s slack', async () => {
    // The last column carries no width of its own, so under table-fixed it
    // takes whatever a wide desktop leaves over — which is what stops the
    // slack landing on the Doctor column, as it did when it reached 352px.
    // It has to be present on the header row and on every body row, or the
    // rows fall out of step with the colgroup.
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    render(<LeaveAuditReport />)

    const headerCells = within(await screen.findByRole('row', { name: /Doctor/ })).getAllByRole('columnheader')
    expect(headerCells[headerCells.length - 1]).toBeEmptyDOMElement()

    const bodyRow = (await screen.findByText('Adams')).closest('tr')
    const bodyCells = [...bodyRow.children]
    expect(bodyCells).toHaveLength(headerCells.length)
    expect(bodyCells[bodyCells.length - 1]).toBeEmptyDOMElement()
  })

  it('freezes the Doctor column, as Team Leave and Hours Summary do', async () => {
    // Six columns of day counts say nothing without the name they belong
    // to, and this table is wider than a phone screen.
    render(<LeaveAuditReport />)

    const header = await screen.findByRole('columnheader', { name: 'Doctor' })
    expect(header.className).toContain('sticky')
    expect(header.className).toContain('left-0')
    const cell = (await screen.findByText('Adams')).closest('td')
    expect(cell.className).toContain('sticky')
    expect(cell.className).toContain('left-0')
    // Its own background, not the row's — a sticky cell can't rely on
    // inheriting one while it is being repositioned.
    expect(cell.className).toContain('bg-canvas')
    // …and opaque in every state. A frozen column hides what scrolls under
    // it by painting over it, so a hover with an alpha modifier turns it
    // into a window — the Annual column showed through the names, and on a
    // touch screen the row last touched keeps :hover after the finger has
    // gone. Any `hover:bg-*/<alpha>` here is that bug.
    for (const el of [cell, cell.closest('tr')]) {
      expect(el.className).not.toMatch(/hover:bg-[\w-]+\/\d/)
    }
  })

  it('shows Consultant (not "Other") as the category label for the Other column', async () => {
    render(<LeaveAuditReport />)
    const rows = await screen.findAllByRole('row')
    // Consultant sorts last under the default category-priority sort.
    expect(within(rows[3]).getByText('Consultant')).toBeInTheDocument()
    expect(within(rows[3]).queryByText('Other')).not.toBeInTheDocument()
  })

  it('filter options are not shown until the Filter button is opened', async () => {
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('narrows the table when a category filter is applied, via the Category group', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr')

    await openGroup(user, 'Category')
    await pickOption(user, 'MO')

    expect(screen.getByText('Zephyr')).toBeInTheDocument()
    expect(screen.queryByText('Adams')).not.toBeInTheDocument()
    expect(screen.queryByText('Consult')).not.toBeInTheDocument()
  })

  it('narrows the table with the Status filter (active/inactive)', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr')

    await openGroup(user, 'Status')
    await pickOption(user, 'Inactive')

    expect(screen.getByText('Consult')).toBeInTheDocument()
    expect(screen.queryByText('Zephyr')).not.toBeInTheDocument()
    expect(screen.queryByText('Adams')).not.toBeInTheDocument()
  })

  it('narrows totals with the Leave type filter', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    const rows = await screen.findAllByRole('row')
    // Ada has 5 annual + 2 study (special) days = 7 total before filtering
    expect(within(rows.find(r => within(r).queryByText('Zephyr'))).getByText('7')).toBeInTheDocument()

    await openGroup(user, 'Leave type')
    await pickOption(user, 'Study leave')

    const filteredRows = screen.getAllByRole('row')
    const adaRow = filteredRows.find(r => within(r).queryByText('Zephyr'))
    // The Study column AND the total both read 2 now — only the study-leave
    // days count — and every other column is zeroed.
    expect(within(adaRow).getAllByText('2')).toHaveLength(2)
    expect(within(adaRow).getAllByText('0')).toHaveLength(AUDIT_LEAVE_COLUMNS.length - 1)
  })

  it('shows a Clear filters link once a filter is active, and clears it', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr')

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument()

    await openGroup(user, 'Category')
    await pickOption(user, 'MO')

    expect(screen.queryByText('Adams')).not.toBeInTheDocument()
    // The Filter popover is still open at this point — same as every other
    // dismissable popover in the app, its first outside click only closes
    // it (see useDismissablePopover), so close it explicitly before the
    // "Clear filters" click can actually land.
    await user.keyboard('{Escape}')
    await user.click(screen.getByText('Clear filters'))
    expect(screen.getByText('Adams')).toBeInTheDocument() // Registrar is back
  })

  it('drills down to one doctor\'s individual requests when selected', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText('Zephyr')

    await openGroup(user, 'Doctor')
    await pickOption(user, 'Zephyr, Ada')  // the Doctor filter still lists full names

    expect(await screen.findByText('Individual requests in range')).toBeInTheDocument()
    expect(screen.getByText(/Annual leave — 10–14 March 2026/)).toBeInTheDocument()
    expect(screen.getByText('5 total days (5 annual leave)')).toBeInTheDocument()
  })
})
