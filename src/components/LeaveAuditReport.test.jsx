import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render as rtlRender, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import LeaveAuditReport from './LeaveAuditReport'
import { AUDIT_LEAVE_COLUMNS } from '../lib/leaveAudit'

// The report keeps its view in the URL. This suite is the By leave type
// table (unchanged); By month has its own suite below.
const render = (ui, { url = '/?by=type' } = {}) => rtlRender(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>)

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
        in() { return builder },
        is() { return builder },
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

    await screen.findByText(/\bZephyr\b/)
    // Doctor rows only — the section header rows hold a button, not a name
    const rows = screen.getAllByRole('row').filter(r => r.querySelector('td[title]'))
    expect(rows).toHaveLength(3)
    // Sectioned Consultants, MOs, Registrars, Interns — each a header row
    for (const label of ['Consultants', 'MOs', 'Registrars']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label} 1`) })).toBeInTheDocument()
    }
    expect(within(rows[0]).getByText(/\bConsult\b/)).toBeInTheDocument() // Consultant
    expect(within(rows[1]).getByText(/\bZephyr\b/)).toBeInTheDocument() // MO
    expect(within(rows[2]).getByText(/\bAdams\b/)).toBeInTheDocument() // Registrar
    // Consultant has no leave requests at all — still shown, with a zero in
    // every leave column plus the total.
    expect(within(rows[0]).getAllByText('0')).toHaveLength(AUDIT_LEAVE_COLUMNS.length + 1)
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
    await screen.findByText(/\bAdams\b/)

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

    const bodyRow = (await screen.findByText(/\bAdams\b/)).closest('tr')
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
    const cell = (await screen.findByText(/\bAdams\b/)).closest('td')
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
    const consultant = (await screen.findByText(/\bConsult\b/)).closest('tr')
    expect(within(consultant).getByText('Consultant')).toBeInTheDocument()
    expect(within(consultant).queryByText('Other')).not.toBeInTheDocument()
  })

  it('folds a section from its header', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText(/\bZephyr\b/)
    const header = screen.getByRole('button', { name: /^MOs 1/ })
    await user.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/\bZephyr\b/)).not.toBeInTheDocument()
    expect(screen.getByText(/\bAdams\b/)).toBeInTheDocument()
  })

  it('offers Expand all only once every section is folded, and it reopens them all', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText(/\bZephyr\b/)
    const headers = screen.getAllByRole('button', { expanded: true })
    expect(headers.length).toBeGreaterThan(1)
    for (const header of headers.slice(0, -1)) await user.click(header)
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
    await user.click(headers[headers.length - 1])
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByText(/\bZephyr\b/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
  })

  it('filter options are not shown until the Filter button is opened', async () => {
    render(<LeaveAuditReport />)
    await screen.findByText(/\bZephyr\b/)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('narrows the table when a category filter is applied, via the Category group', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText(/\bZephyr\b/)

    await openGroup(user, 'Category')
    await pickOption(user, 'MO')

    expect(screen.getByText(/\bZephyr\b/)).toBeInTheDocument()
    expect(screen.queryByText(/\bAdams\b/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bConsult\b/)).not.toBeInTheDocument()
  })

  it('narrows the table with the Status filter (active/inactive)', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText(/\bZephyr\b/)

    await openGroup(user, 'Status')
    await pickOption(user, 'Inactive')

    expect(screen.getByText(/\bConsult\b/)).toBeInTheDocument()
    expect(screen.queryByText(/\bZephyr\b/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bAdams\b/)).not.toBeInTheDocument()
  })

  it('narrows totals with the Leave type filter', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    const rows = await screen.findAllByRole('row')
    // Ada has 5 annual + 2 study (special) days = 7 total before filtering
    expect(within(rows.find(r => within(r).queryByText(/\bZephyr\b/))).getByText('7')).toBeInTheDocument()

    await openGroup(user, 'Leave type')
    await pickOption(user, 'Study leave')

    const filteredRows = screen.getAllByRole('row')
    const adaRow = filteredRows.find(r => within(r).queryByText(/\bZephyr\b/))
    // The Study column AND the total both read 2 now — only the study-leave
    // days count — and every other column is zeroed.
    expect(within(adaRow).getAllByText('2')).toHaveLength(2)
    expect(within(adaRow).getAllByText('0')).toHaveLength(AUDIT_LEAVE_COLUMNS.length - 1)
  })

  it('shows a Clear filters link once a filter is active, and clears it', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText(/\bZephyr\b/)

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument()

    await openGroup(user, 'Category')
    await pickOption(user, 'MO')

    expect(screen.queryByText(/\bAdams\b/)).not.toBeInTheDocument()
    // The Filter popover is still open at this point — same as every other
    // dismissable popover in the app, its first outside click only closes
    // it (see useDismissablePopover), so close it explicitly before the
    // "Clear filters" click can actually land.
    await user.keyboard('{Escape}')
    await user.click(screen.getByText('Clear filters'))
    expect(screen.getByText(/\bAdams\b/)).toBeInTheDocument() // Registrar is back
  })

  it('drills down to one doctor\'s individual requests when selected', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />)
    await screen.findByText(/\bZephyr\b/)

    await openGroup(user, 'Doctor')
    await pickOption(user, 'Zephyr, Ada')  // the Doctor filter still lists full names

    expect(await screen.findByText('Individual requests in range')).toBeInTheDocument()
    expect(screen.getByText(/Annual leave — 10–14 March 2026/)).toBeInTheDocument()
    expect(screen.getByText('5 total days (5 annual leave)')).toBeInTheDocument()
  })
})

describe('LeaveAuditReport — By month', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 24))
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PROFILES.map(p => ({ ...p, contract_type: 'full' })), error: null }
    mockResponses['leave_requests:select'] = {
      data: [
        ...LEAVE_REQUESTS,
        { id: 'r4', profile_id: 'p1', leave_type: 'annual', date_from: '2026-06-28', date_to: '2026-07-07', annual_leave_days: 7, status: 'approved' },
        { id: 'r5', profile_id: 'p1', leave_type: 'sick', date_from: '2026-05-01', date_to: '2026-05-02', status: 'pending' },
      ],
      error: null,
    }
    mockResponses['roster_months:select'] = { data: [{ id: 'm3', year: 2026, month: 3 }], error: null }
  })

  const rowFor = name => screen.getByRole('link', { name: `${name}’s year` }).closest('tr')
  const cells = row => within(row).getAllByRole('cell').map(c => c.textContent)

  it('is the default view: a year selector, the switch, and month columns', async () => {
    render(<LeaveAuditReport />, { url: '/' })
    const table = await screen.findByTestId('all-leave-by-month')
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent).filter(Boolean)).toEqual([
      'Doctor', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      'Annual booked', 'Annual left', 'Sick', 'Other', 'Total days', 'Since last break',
    ])
    expect(screen.getByRole('button', { name: /2026, jump to year/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    // Same sections as By leave type.
    for (const label of ['Consultants', 'MOs', 'Registrars']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label} 1`) })).toBeInTheDocument()
    }
  })

  it('shows each month, the split and a total the months add up to', async () => {
    render(<LeaveAuditReport />, { url: '/' })
    await screen.findByTestId('all-leave-by-month')
    const ada = cells(rowFor('Ada Zephyr'))
    // Doctor, 12 months, Annual booked, Annual left, Sick, Other, Total, Since last break, arrow
    const months = ada.slice(1, 13).map(Number)
    expect(months).toEqual([0, 0, 5, 2, 0, 2, 5, 0, 0, 0, 0, 0])
    expect(ada.slice(13, 18).map(Number)).toEqual([12, 10, 0, 2, 14])
    expect(months.reduce((s, d) => s + d, 0)).toBe(14)
    expect(ada[0]).toMatch(/MO/); expect(ada[0]).not.toMatch(/Full-time/)

    const bo = cells(rowFor('Bo Adams'))
    expect(bo.slice(13, 18).map(Number)).toEqual([0, 22, 2, 0, 2])
  })

  it('fills in Since last break, with a Long chip past the threshold', async () => {
    render(<LeaveAuditReport />, { url: '/' })
    await screen.findByTestId('all-leave-by-month')
    // r1 (5 days) and r4 (10 days) are breaks; the last ended 7 July.
    expect(await within(rowFor('Ada Zephyr')).findByText(/140 days/)).toBeInTheDocument()
    expect(within(rowFor('Ada Zephyr')).getByText('Long')).toBeInTheDocument()
    expect(within(rowFor('Bo Adams')).getByText('None since joining')).toBeInTheDocument()
    expect(within(rowFor('Bo Adams')).queryByText('Long')).not.toBeInTheDocument()
    expect(screen.getByTestId('by-month-legend').textContent).toMatch(/None.*1–2 days.*3–5 days.*6 or more.*More than 120 days/s)
  })

  it('opens a doctor\'s year from the name and the arrow, never from a month cell', async () => {
    render(<LeaveAuditReport />, { url: '/' })
    await screen.findByTestId('all-leave-by-month')
    expect(screen.getByRole('link', { name: 'Ada Zephyr’s year' })).toHaveAttribute('href', '/my-year/p1?year=2026')
    expect(screen.getByRole('link', { name: 'Open Ada Zephyr’s year' })).toHaveAttribute('href', '/my-year/p1?year=2026')
    expect(within(rowFor('Ada Zephyr')).getAllByRole('link')).toHaveLength(2)
  })

  it('opens the month breakdown from a cell, by click and by keyboard focus', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />, { url: '/' })
    await screen.findByTestId('all-leave-by-month')
    const cell = screen.getByRole('button', { name: 'Ada Zephyr, March: 5 days on leave' })

    act(() => cell.focus())
    const preview = screen.getByTestId('month-breakdown')
    expect(preview.textContent).toMatch(/March 2026.*Ada Zephyr/s)
    // Hover/focus preview: links greyed, a hint, no ×, and the month outlined rather than filled.
    expect(within(preview).queryByRole('link')).not.toBeInTheDocument()
    expect(within(preview).getByText('Ada’s year ›')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('month-breakdown-hint')).toHaveTextContent('Click the month to keep this open and use the links.')
    expect(within(preview).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(cell).toHaveAttribute('aria-pressed', 'false')
    await user.click(cell)
    // Pinned: the month turns teal, the hint goes, and an × closes it.
    expect(cell).toHaveAttribute('aria-pressed', 'true')
    expect(cell.className).toMatch(/bg-accent/)
    expect(screen.queryByTestId('month-breakdown-hint')).not.toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'March 2026, Ada Zephyr' })
    expect(dialog.textContent).toMatch(/Annual leave.*10–14 Mar.*5 days/s)
    expect(dialog.textContent).toMatch(/Annual 5 · Sick 0 · Other 0/)
    expect(within(dialog).getByRole('link', { name: /Roster/ })).toHaveAttribute('href', '/roster/m3')
    expect(within(dialog).getByRole('link', { name: /Ada’s year/ })).toHaveAttribute('href', '/my-year/p1?tab=leave&year=2026')

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('month-breakdown')).not.toBeInTheDocument()
    expect(cell).toHaveAttribute('aria-pressed', 'false')

    await user.click(cell)
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('month-breakdown')).not.toBeInTheDocument()
  })

  it('switches to By leave type and back, keeping the choice in the view switch', async () => {
    const user = userEvent.setup()
    render(<LeaveAuditReport />, { url: '/' })
    await screen.findByTestId('all-leave-by-month')
    await user.click(screen.getByRole('button', { name: 'By leave type' }))
    expect(screen.queryByTestId('all-leave-by-month')).not.toBeInTheDocument()
    // Both views take the year stepper; there are no From / To dates.
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Previous year/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'By month' }))
    expect(await screen.findByTestId('all-leave-by-month')).toBeInTheDocument()
  })
})
