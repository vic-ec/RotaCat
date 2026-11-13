import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MonthWorkspace from './MonthWorkspace'

let mockAuth = { user: { id: 'admin-auth-1' }, isAdmin: true, canSubmitLeave: false }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const getApprovalWarnings = vi.fn()
vi.mock('../lib/leaveApprovals', async () => {
  const actual = await vi.importActual('../lib/leaveApprovals')
  return { ...actual, getApprovalWarnings: (...args) => getApprovalWarnings(...args) }
})

const createNotification = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/notifications', () => ({
  createNotification: (...args) => createNotification(...args),
}))

vi.mock('./LeaveRequestForm', () => ({
  default: ({ initialDateFrom, initialDateTo, onSubmitted }) => (
    <div>
      <p>LeaveRequestFormStub: {initialDateFrom} to {initialDateTo}</p>
      <button onClick={onSubmitted}>Simulate submit</button>
    </div>
  ),
}))

const { mockResponses, fromCalls } = vi.hoisted(() => ({ mockResponses: {}, fromCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      fromCalls.push(table)
      let method = null
      const builder = {
        select() { method = 'select'; return builder },
        update() { method = 'update'; return builder },
        insert() { method = 'insert'; return builder },
        eq() { return builder },
        gte() { return builder },
        lte() { return builder },
        not() { return builder },
        single() { return builder },
        order() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: null, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

const MAX_BY_COLUMN = { MO: 2, Registrar: 2, EC_Intern: 2, OT_Intern: 1 }

// p1 (Anderson, MO) approved on 12 Aug; p2 (Botha, Registrar) pending on
// 12 Aug — together they fill the shared full-time pool (2) while the OT
// Intern slot stays free: 2 of 3 used, no room for an MO or Registrar.
const APPROVED_ROW = {
  id: 'req-1', profile_id: 'p1', date_from: '2026-08-12', date_to: '2026-08-12',
  leave_type: 'annual', status: 'approved', annual_leave_days: 1, notes: null,
  profiles: { name: 'Alice', surname: 'Anderson', category: 'MO' },
}
const PENDING_ROW = {
  id: 'req-2', profile_id: 'p2', date_from: '2026-08-12', date_to: '2026-08-12',
  leave_type: 'annual', status: 'pending', annual_leave_days: 1, notes: 'Family event',
  profiles: { name: 'Bob', surname: 'Botha', category: 'Registrar' },
}

function baseProps(overrides = {}) {
  const approvedByDate = new Map([
    ['2026-08-12', [{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' }]],
  ])
  const pendingByDate = new Map([
    ['2026-08-12', [{ profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'pending', dateFrom: '2026-08-12', dateTo: '2026-08-12' }]],
  ])
  const countByColumnPerDate = new Map([
    ['2026-08-12', new Map([['MO', 1], ['Registrar', 1]])],
  ])

  return {
    year: 2026,
    month: 8,
    onMonthChange: vi.fn(),
    approvedByDate,
    pendingByDate,
    approvedRows: [APPROVED_ROW],
    pendingRows: [PENDING_ROW],
    countByColumnPerDate,
    publicHolidaysByDate: new Map(),
    maxByColumnKey: MAX_BY_COLUMN,
    maxFullTime: 2, // the EC full-time (MO+Registrar+EC_Intern) sub-cap — combined with OT_Intern's own cap of 1, the day's real ceiling is 3
    onDataChanged: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
}

// MonthWorkspace reads/writes the selected day via useSearchParams, so it
// needs a Router in the tree even outside AnnualLeavePlanner's own
// MemoryRouter.
function renderWorkspace(overrides, initialEntries = ['/']) {
  return render(<MonthWorkspace {...baseProps(overrides)} />, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>,
  })
}

// jsdom has no matchMedia, so useIsDesktop reports desktop: the selected
// day's details render in the rail card. The two grids (desktop and phone
// cells) are both in the DOM, gated only by CSS, so day-cell queries are
// scoped to one of them.
function desktopGrid() {
  return within(screen.getByTestId('planner-calendar-grid').querySelector('.hidden.lg\\:block'))
}
function mobileGrid() {
  return within(screen.getByTestId('planner-calendar-grid').querySelector('.lg\\:hidden'))
}
function details() {
  return within(screen.getByTestId('planner-details-card'))
}
async function selectDay(user, date = '2026-08-12') {
  await user.click(desktopGrid().getByRole('button', { name: new RegExp(`^${date}`) }))
  return details()
}

describe('MonthWorkspace', () => {
  beforeEach(() => {
    fromCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['leave_requests:update'] = { data: null, error: null }
    mockResponses['notifications:insert'] = { data: null, error: null }
    getApprovalWarnings.mockReset()
    createNotification.mockClear()
    mockAuth = { user: { id: 'admin-auth-1' }, isAdmin: true, canSubmitLeave: false }
    // Fixtures below assume "today" is 6 Aug 2026 (the panel's request
    // action prefills the form with todayStr()) — pin the clock rather than
    // relying on the real wall-clock date.
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('calendar grid', () => {
    it('starts the week on Monday, with full weekday names on the desktop grid and two-letter ones on the phone grid', () => {
      renderWorkspace()
      const headers = [...screen.getByTestId('planner-calendar-grid').querySelector('.hidden.lg\\:block .grid').children].map(h => h.textContent)
      expect(headers).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
      expect(mobileGrid().getByText('Mo')).toBeInTheDocument()
      expect(mobileGrid().getByText('Su')).toBeInTheDocument()
      // 1 Aug 2026 is a Saturday: five leading blanks before it.
      const cells = [...screen.getByTestId('planner-calendar-grid').querySelectorAll('.hidden.lg\\:block .grid')[1].children]
      expect(cells.slice(0, 5).every(c => c.tagName === 'DIV')).toBe(true)
      expect(cells[5]).toHaveAttribute('aria-label', '2026-08-01')
      expect(screen.getByText('August 2026')).toBeInTheDocument()
    })

    it('shows slot pips on every day — a free day reads "0 of 3 slots used", the fixture\'s 12th "2 of 3"', () => {
      renderWorkspace()
      const free = desktopGrid().getByRole('button', { name: /^2026-08-03/ })
      expect(within(free).getByRole('img', { name: '0 of 3 slots used' })).toBeInTheDocument()
      const busy = desktopGrid().getByRole('button', { name: /^2026-08-12/ })
      expect(within(busy).getByRole('img', { name: '2 of 3 slots used' })).toBeInTheDocument()
      // The phone cell carries the same pips, at a 44px minimum.
      const phone = mobileGrid().getByRole('button', { name: /^2026-08-12/ })
      expect(within(phone).getByRole('img', { name: '2 of 3 slots used' })).toBeInTheDocument()
      expect(phone).toHaveClass('min-h-[44px]')
    })

    it('filled pips take the day\'s capacity colour; an over-capacity day appends +N', () => {
      const countByColumnPerDate = new Map([
        ['2026-08-12', new Map([['MO', 2], ['Registrar', 2], ['OT_Intern', 1]])],
      ])
      renderWorkspace({ countByColumnPerDate })
      const cell = desktopGrid().getByRole('button', { name: /^2026-08-12/ })
      const pips = within(cell).getByRole('img', { name: '5 on leave, 3 slots' })
      expect(pips.querySelectorAll('.bg-capAtCapacity')).toHaveLength(3)
      expect(within(pips).getByText('+2')).toBeInTheDocument()
    })

    it('shades weekend columns, outlines a public holiday with its name, marks today, and tints the selected day', async () => {
      const user = userEvent.setup()
      renderWorkspace({ publicHolidaysByDate: new Map([['2026-08-10', 'Some Holiday']]) })
      expect(desktopGrid().getByRole('button', { name: /^2026-08-08/ })).toHaveClass('bg-dateWeekend-tint') // Saturday
      const holiday = desktopGrid().getByRole('button', { name: '2026-08-10, Some Holiday' })
      expect(holiday).toHaveClass('ring-ink')
      expect(within(holiday).getByText('Some Holiday')).toBeInTheDocument()
      expect(within(desktopGrid().getByRole('button', { name: /^2026-08-06/ })).getByText('6')).toHaveClass('bg-accent') // today
      await selectDay(user)
      const selected = desktopGrid().getByRole('button', { name: /^2026-08-12/ })
      expect(selected).toHaveAttribute('aria-pressed', 'true')
      expect(selected).toHaveClass('ring-accent', 'bg-accent-tint')
    })

    it('desktop cells list up to three names with the category abbreviation, pending in italics, then "+N more"', () => {
      renderWorkspace({
        approvedByDate: new Map([
          ['2026-08-16', [
            { profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
            { profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
            { profileId: 'p3', surname: 'Cronje', category: 'COSMO', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
            { profileId: 'p4', surname: 'Davis', category: 'OT_Intern', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
          ]],
        ]),
        pendingByDate: new Map([
          ['2026-08-12', [{ profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'pending', dateFrom: '2026-08-12', dateTo: '2026-08-12' }]],
        ]),
      })
      const cell16 = desktopGrid().getByRole('button', { name: /^2026-08-16/ })
      expect(within(cell16).getByText('Anderson')).toBeInTheDocument()
      expect(within(cell16).getByText('Reg')).toBeInTheDocument()
      expect(within(cell16).queryByText('Davis')).not.toBeInTheDocument()
      expect(within(cell16).getByText('+1 more')).toBeInTheDocument()
      const cell12 = desktopGrid().getByRole('button', { name: /^2026-08-12/ })
      expect(within(cell12).getByText('Botha').closest('div')).toHaveClass('italic')
      // Phone cells carry no names at all.
      expect(mobileGrid().queryByText('Anderson')).not.toBeInTheDocument()
    })

    it('the toolbar search narrows the names on the grid, never the pips', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      await user.type(screen.getByRole('searchbox', { name: 'Search name' }), 'bot')
      const cell = desktopGrid().getByRole('button', { name: /^2026-08-12/ })
      expect(within(cell).getByText('Botha')).toBeInTheDocument()
      expect(within(cell).queryByText('Anderson')).not.toBeInTheDocument()
      expect(within(cell).getByRole('img', { name: '2 of 3 slots used' })).toBeInTheDocument()
    })
  })

  describe('toolbar and panel', () => {
    it('one toolbar row: Overview back link, search, legend, the capacity key, and an empty toggle slot', () => {
      renderWorkspace()
      const toolbar = within(screen.getByTestId('planner-toolbar'))
      const backButton = toolbar.getByRole('button', { name: 'Overview' })
      expect(backButton.className).not.toContain('btn-secondary')
      expect(backButton).toHaveClass('text-ink-light')
      expect(toolbar.getByRole('searchbox', { name: 'Search name' })).toBeInTheDocument()
      expect(toolbar.getByRole('button', { name: 'Legend' })).toHaveClass('btn-utility', 'h-[30px]', 'w-[30px]')
      expect(toolbar.getByTestId('capacity-key')).toHaveTextContent('0 used')
      expect(toolbar.getByTestId('capacity-key')).toHaveTextContent('3+ used')
      // The month stepper is not up here: it is the panel's.
      expect(toolbar.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument()
    })

    it('the panel: eyebrow, the month stepper (the only period control, no Today), Showing, headline, capacity bar, then the one filled button', () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
      renderWorkspace({ month: 9 })
      const panel = within(screen.getByTestId('planner-request-panel'))
      expect(panel.getByText('Annual leave · Month')).toBeInTheDocument()
      const prevMonth = panel.getByRole('button', { name: 'Previous month' })
      const stepper = prevMonth.parentElement
      expect(stepper).toHaveClass('btn-utility', 'w-full')
      expect(stepper).toContainElement(panel.getByRole('button', { name: /^September 2026/ }))
      expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Previous month' })).toHaveLength(1)

      const showing = panel.getByLabelText('Showing')
      const headline = panel.getByText(/of 30 days have room for your category/)
      const bar = panel.getByRole('img', { name: /0\/3 slots used/ })
      const action = panel.getByRole('button', { name: 'Request annual leave' })
      const order = [stepper, showing, headline, bar, action]
      for (let i = 1; i < order.length; i++) {
        expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
      expect(action).toHaveClass('btn-primary')
      expect(screen.getAllByRole('button').filter(b => b.className.includes('btn-primary'))).toHaveLength(1)
    })

    it('the headline respects both caps: 1 MO + 1 Registrar on the 12th leaves 30 of 31 days with room for an MO', () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
      renderWorkspace()
      expect(screen.getByText(/of 31 days have room for your category/).parentElement).toHaveTextContent(/^30/)
      expect(screen.getByLabelText('Showing')).toHaveTextContent('MO')
    })

    it('the capacity bar in the panel reads the month: 30 days free, 1 day at 2 of 3', () => {
      renderWorkspace()
      const panel = within(screen.getByTestId('planner-request-panel'))
      expect(panel.getByText('0/3 slots used · 30 days')).toBeInTheDocument()
      expect(panel.getByText('2/3 slots used · 1 day')).toBeInTheDocument()
      expect(panel.getByText('3/3 slots used · 0 days').closest('li')).toHaveClass('text-ink-muted/60')
    })

    it('Showing previews another category, with a note that submitting still counts against the real one', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
      const user = userEvent.setup()
      renderWorkspace()

      await user.click(screen.getByLabelText('Showing'))
      await user.click(await screen.findByRole('option', { name: 'Registrar' }))
      expect(screen.getByText(/of 31 days have room for that category/)).toBeInTheDocument()
      expect(screen.getByText(/Previewing Registrar — your own category is MO/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Reset' }))
      expect(screen.getByText(/of 31 days have room for your category/)).toBeInTheDocument()
      expect(screen.queryByText(/Previewing/)).not.toBeInTheDocument()
    })

    it('no Showing or headline for a category with no capacity column (Consultant), but the stepper, bar and action stay', () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'Consultant' } }
      renderWorkspace()
      expect(screen.queryByText(/days have room for your category/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Showing')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
      expect(screen.getByText('0/3 slots used · 30 days')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Request annual leave' })).toBeInTheDocument()
    })

    it('no action for a viewer who cannot submit leave', () => {
      mockAuth = { user: { id: 'admin-auth-1' }, isAdmin: true, canSubmitLeave: false, profile: { category: 'MO' } }
      renderWorkspace()
      expect(screen.getByText(/of 31 days have room/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Request annual leave' })).not.toBeInTheDocument()
    })

    it('the panel\'s Request annual leave opens the form on today when today is in the month', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
      const user = userEvent.setup()
      renderWorkspace()
      await user.click(screen.getByRole('button', { name: 'Request annual leave' }))
      expect(screen.getByText(/LeaveRequestFormStub: 2026-08-06 to 2026-08-06/)).toBeInTheDocument()
    })

    it('the rail is sticky at 320px on a desktop and first in the stack below, ahead of the toolbar and grid', () => {
      renderWorkspace()
      const rail = screen.getByTestId('planner-request-panel').parentElement
      expect(rail).toHaveClass('order-1', 'lg:order-none', 'lg:sticky', 'lg:top-4', 'lg:w-80')
      expect(rail).not.toHaveClass('w-80')
      expect(screen.getByTestId('planner-toolbar').parentElement).toHaveClass('order-2')
      expect(screen.getByTestId('planner-calendar-grid').parentElement).toHaveClass('order-3', 'min-w-0')
    })

    it('month navigation and the back link call their callbacks', async () => {
      const user = userEvent.setup()
      const onMonthChange = vi.fn()
      const onBack = vi.fn()
      renderWorkspace({ onMonthChange, onBack })

      await user.click(screen.getByRole('button', { name: 'Next month' }))
      expect(onMonthChange).toHaveBeenCalledWith(2026, 9)

      await user.click(screen.getByRole('button', { name: 'Overview' }))
      expect(onBack).toHaveBeenCalled()
    })
  })

  describe('legend', () => {
    it('collapsed by default, shows Consultant for an admin once expanded, hides it for a non-admin', async () => {
      const user = userEvent.setup()
      const admin = renderWorkspace()
      expect(screen.queryByText('Consultant')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Legend' }))
      expect(screen.getByText('Consultant')).toBeInTheDocument()
      admin.unmount()

      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
      renderWorkspace()
      await user.click(screen.getByRole('button', { name: 'Legend' }))
      expect(screen.queryByText('Consultant')).not.toBeInTheDocument()
    })

    it('a non-admin full-time viewer sees only 3 states on the phone legend; the desktop legend still lists the generic 4-state scale', async () => {
      const user = userEvent.setup()
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
      renderWorkspace()
      await user.click(screen.getByRole('button', { name: 'Legend' }))
      expect(screen.getAllByText('Near capacity')).toHaveLength(1)
      expect(screen.getAllByText('Available')).toHaveLength(2)
    })

    it('an admin sees the generic 4-state scale on both legend blocks, and the public holiday entry', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      await user.click(screen.getByRole('button', { name: 'Legend' }))
      expect(screen.getAllByText('Near capacity')).toHaveLength(2)
      expect(screen.getByText('Public holiday')).toBeInTheDocument()
    })
  })

  describe('selected day', () => {
    it('rests on "Select a day to see details." and fills the rail card — no popup — when a day is clicked', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      expect(details().getByText('Selected day')).toBeInTheDocument()
      expect(details().getByText('Select a day to see details.')).toBeInTheDocument()

      const card = await selectDay(user)
      expect(card.getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('status box: the day\'s count in words and its own colour, the viewer\'s room, both pools, and the fixed note', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'Registrar' } }
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)

      const status = card.getByText('2 of 3 slots used')
      expect(status).toHaveClass('text-capNear-ink')
      expect(card.getByText('No room for your category (Registrar)')).toBeInTheDocument()
      expect(card.getByText('MO · Registrar · EC Intern: 2 of 2 slots used')).toBeInTheDocument()
      expect(card.getByText('OT Intern: 0 of 1 slot used')).toBeInTheDocument()
      expect(card.getByText('The two pools are separate: the OT Intern slot cannot be used by other categories.')).toBeInTheDocument()
    })

    it('reads "Free · 0 of 3 slots used" with room, "Full · 3 of 3" at the ceiling, and "Over capacity · N on leave, 3 slots" past it', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'Registrar' } }
      const user = userEvent.setup()
      const full = new Map([['2026-08-12', new Map([['MO', 2], ['OT_Intern', 1]])]])
      const over = new Map([['2026-08-12', new Map([['MO', 2], ['Registrar', 2], ['OT_Intern', 1]])]])

      const free = renderWorkspace()
      let card = await selectDay(user, '2026-08-03')
      expect(card.getByText('Free · 0 of 3 slots used')).toBeInTheDocument()
      expect(card.getByText('Room for your category (Registrar)')).toBeInTheDocument()
      free.unmount()

      const atCeiling = renderWorkspace({ countByColumnPerDate: full })
      card = await selectDay(user)
      expect(card.getByText('Full · 3 of 3 slots used')).toBeInTheDocument()
      atCeiling.unmount()

      renderWorkspace({ countByColumnPerDate: over })
      card = await selectDay(user)
      expect(card.getByText('Over capacity · 5 on leave, 3 slots')).toBeInTheDocument()
    })

    it('an OT Intern still has room on a day whose shared pool is full — the OT slot is its own, never spillover', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'OT_Intern' } }
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      expect(card.getByText('Room for your category (OT Intern)')).toBeInTheDocument()
      expect(card.getByRole('button', { name: 'Request leave from this day' })).toBeInTheDocument()
    })

    it('an admin reads the same pool-accurate lines, never "N slots available across all categories"', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      expect(card.getByText('MO · Registrar · EC Intern: 2 of 2 slots used')).toBeInTheDocument()
      expect(card.getByText('OT Intern: 0 of 1 slot used')).toBeInTheDocument()
      expect(card.queryByText(/available across all doctor categories/)).not.toBeInTheDocument()
      expect(card.queryByText(/for your category/)).not.toBeInTheDocument()
    })

    it('lists who is on leave with status, plain surnames never coloured by status', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      expect(card.getByText('Anderson')).toHaveClass('text-ink')
      expect(card.getByText('Botha')).toHaveClass('text-ink')
      expect(card.getByText('Approved')).toHaveClass('text-success')
      expect(card.getByText('Pending review')).toBeInTheDocument()
    })

    it('shows a Consultant entry for an admin, hides it for a non-admin', async () => {
      const withConsultant = {
        approvedByDate: new Map([
          ['2026-08-12', [
            { profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' },
            { profileId: 'p5', surname: 'Smith', category: 'Consultant', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' },
          ]],
        ]),
      }
      const user = userEvent.setup()
      const admin = renderWorkspace(withConsultant)
      let card = await selectDay(user)
      expect(card.getByText('Smith')).toBeInTheDocument()
      admin.unmount()

      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
      renderWorkspace(withConsultant)
      card = await selectDay(user)
      expect(card.queryByText('Smith')).not.toBeInTheDocument()
    })

    it('shows the public holiday name in the details as well as on the cell', async () => {
      const user = userEvent.setup()
      renderWorkspace({ publicHolidaysByDate: new Map([['2026-08-12', 'Some Holiday']]) })
      const card = await selectDay(user)
      expect(card.getByText('Some Holiday')).toBeInTheDocument()
      expect(screen.getAllByText('Some Holiday')).toHaveLength(2)
    })

    it('with room: an outlined "Request leave from this day" opens the form on that day', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'OT_Intern' } }
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      const button = card.getByRole('button', { name: 'Request leave from this day' })
      expect(button).toHaveClass('btn-secondary')
      await user.click(button)
      expect(screen.getByText('LeaveRequestFormStub: 2026-08-12 to 2026-08-12')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Simulate submit' }))
      expect(screen.queryByText(/LeaveRequestFormStub/)).not.toBeInTheDocument()
      expect(card.getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    })

    it('without room: the overbooked note and an outlined "Submit for admin approval", still opening the form', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      expect(card.getByText('No slot is free for your category. You can still submit for an emergency; an admin must approve it as overbooked leave.')).toBeInTheDocument()
      const button = card.getByRole('button', { name: 'Submit for admin approval' })
      expect(button).toHaveClass('btn-secondary')
      await user.click(button)
      expect(screen.getByText('LeaveRequestFormStub: 2026-08-12 to 2026-08-12')).toBeInTheDocument()
    })

    it('non-admin: pending entries are read-only, no approve/reject controls', async () => {
      mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      expect(card.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
      expect(card.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    })

    it('opens on highlightDate on mount (a deep link from the Requests queue) and reports it consumed', () => {
      const onHighlightConsumed = vi.fn()
      renderWorkspace({ highlightDate: '2026-08-12', onHighlightConsumed })
      expect(details().getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
      expect(onHighlightConsumed).toHaveBeenCalled()
    })

    it('does not report a highlight consumed when no highlightDate was given', () => {
      const onHighlightConsumed = vi.fn()
      renderWorkspace({ onHighlightConsumed })
      expect(onHighlightConsumed).not.toHaveBeenCalled()
    })

    it('reopens the selected day straight from the URL — surviving a background-triggered reload with no highlightDate prop', () => {
      renderWorkspace({}, ['/?day=2026-08-12'])
      expect(details().getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    })

    it('below lg the same details open in a bottom sheet, with no inline card', async () => {
      // A phone-width matchMedia for this test only.
      const mql = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
      window.matchMedia = vi.fn().mockReturnValue(mql)
      try {
        const user = userEvent.setup()
        renderWorkspace()
        expect(screen.queryByTestId('planner-details-card')).not.toBeInTheDocument()
        await user.click(mobileGrid().getByRole('button', { name: /^2026-08-12/ }))
        const sheet = screen.getByRole('dialog', { name: 'Selected day' })
        expect(within(sheet).getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
        await user.click(within(sheet).getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      } finally {
        delete window.matchMedia
      }
    })
  })

  describe('admin review', () => {
    it('sees the pending request detail with its note', async () => {
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      expect(await card.findByText('Bob Botha')).toBeInTheDocument()
      expect(card.getByText('"Family event"')).toBeInTheDocument()
    })

    it('a clean pending request (no warnings) approves in one click', async () => {
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      const onDataChanged = vi.fn()
      renderWorkspace({ onDataChanged })
      const card = await selectDay(user)

      await user.click(await card.findByRole('button', { name: 'Approve' }))
      expect(onDataChanged).toHaveBeenCalled()
      expect(fromCalls).toContain('leave_requests')
    })

    it('a Tier-2 warning requires a second click ("Approve anyway" → "Confirm approval")', async () => {
      getApprovalWarnings.mockResolvedValue({
        supervisionBreaches: [{ date: '2026-08-12', shiftTypeId: 'wd08', remainingSupervisors: 0 }],
        balanceWarnings: [],
        hourCeilingWarning: null,
      })
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)

      expect(await card.findByText(/drop supervision below the required minimum/i)).toBeInTheDocument()
      await user.click(await card.findByRole('button', { name: 'Approve anyway' }))
      expect(await card.findByRole('button', { name: 'Confirm approval' })).toBeInTheDocument()
    })

    it('shows the live capacity re-check\'s breach, naming the limit and the first date, and asks to approve as overbooked', async () => {
      getApprovalWarnings.mockResolvedValue({
        supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null,
        capacityWarning: { breach: 'column', columnLabel: 'Registrar', limitLabel: 'Registrar limit', limitMax: 2, firstBreachDate: '2026-08-12' },
      })
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)

      expect(await card.findByText(/Approving would breach the Registrar limit \(2\) on 2026-08-12/)).toBeInTheDocument()
      await user.click(await card.findByRole('button', { name: 'Approve as overbooked' }))
      expect(await card.findByRole('button', { name: 'Confirm overbooked approval' })).toBeInTheDocument()
    })

    it('a shared-pool breach names the pool', async () => {
      getApprovalWarnings.mockResolvedValue({
        supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null,
        capacityWarning: { breach: 'fulltime', columnLabel: 'Registrar', limitLabel: 'shared pool (MO, Registrar, EC Intern)', limitMax: 2, firstBreachDate: '2026-08-12' },
      })
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user)
      expect(await card.findByText(/Approving would breach the shared pool \(MO, Registrar, EC Intern\) \(2\) on 2026-08-12/)).toBeInTheDocument()
    })

    it('a request submitted as overbooked whose capacity has since freed up says so, and approves plainly', async () => {
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null, capacityWarning: null })
      const user = userEvent.setup()
      renderWorkspace({ pendingRows: [{ ...PENDING_ROW, over_capacity: true, capacity_breach: 'fulltime' }] })
      const card = await selectDay(user)
      expect(await card.findByText('Submitted as overbooked; capacity has since freed up.')).toBeInTheDocument()
      expect(await card.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
    })

    it('rejecting requires a confirm step and notifies the doctor', async () => {
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      const onDataChanged = vi.fn()
      renderWorkspace({ onDataChanged })
      const card = await selectDay(user)

      await user.click(await card.findByRole('button', { name: 'Reject' }))
      await user.click(card.getByRole('button', { name: 'Confirm reject' }))

      expect(onDataChanged).toHaveBeenCalled()
      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'leave_rejected' }))
    })
  })
})
