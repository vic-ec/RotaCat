import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SpecialMonthWorkspace from './SpecialMonthWorkspace'

let mockAuth = { isAdmin: true }
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

function entry(profileId, leaveType, dateFrom, dateTo, status, surname, category = 'MO') {
  return { profileId, leaveType, dateFrom, dateTo, status, surname, category }
}

const LEAVE_BY_DATE = new Map([
  ['2026-08-10', [
    entry('p1', 'maternity', '2026-08-08', '2026-08-14', 'pending', 'Ellis'),
    entry('p9', 'conference', '2026-08-10', '2026-08-10', 'approved', 'Vance', 'Consultant'),
  ]],
])

function renderWorkspace(props = {}, route = '/leave') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SpecialMonthWorkspace
        year={2026}
        month={8}
        onMonthChange={vi.fn()}
        leaveByDate={LEAVE_BY_DATE}
        publicHolidaysByDate={new Map([['2026-08-09', "Women's Day"]])}
        rotationsByDoctorId={new Map()}
        onBack={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

// jsdom applies no breakpoints, so the desktop grid and the phone grid are
// both in the DOM. Scope day queries to one of them.
function desktopGrid() {
  return screen.getByTestId('planner-calendar-grid').querySelector('.hidden.lg\\:block')
}
function mobileGrid() {
  return screen.getByTestId('planner-calendar-grid').querySelector('.lg\\:hidden')
}
function desktopDay(date) {
  return desktopGrid().querySelector(`[aria-label^="${date}"]`)
}
function details() {
  return within(screen.getByTestId('special-day-details'))
}
async function selectDay(user, date) {
  await user.click(desktopDay(date))
  return details()
}

describe('SpecialMonthWorkspace', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0))
    mockAuth = { isAdmin: true, canSubmitLeave: true }
  })

  describe('calendar grid', () => {
    it('is the shared Monday-first grid, with names and category abbreviations read off the desktop cells', () => {
      renderWorkspace()
      const headers = [...desktopGrid().querySelectorAll('[role="columnheader"], .grid > div')].map(d => d.textContent)
      expect(headers[0]).toBe('Monday')
      const day10 = desktopDay('2026-08-10')
      expect(within(day10).getByText('Ellis')).toBeInTheDocument()
      expect(within(day10).getByText('Vance')).toBeInTheDocument()
      expect(within(day10).getByText('MO')).toBeInTheDocument()
      expect(within(day10).getByText('C')).toBeInTheDocument()
    })

    it('puts pips on every day, worded for the guideline, and the phone cells carry number and pips only', () => {
      renderWorkspace()
      // Two doctors out on the 10th of the three-doctor guideline.
      expect(within(desktopDay('2026-08-10')).getByRole('img', { name: '2 of 3 on special leave' })).toBeInTheDocument()
      expect(within(desktopDay('2026-08-12')).getByRole('img', { name: '0 of 3 on special leave' })).toBeInTheDocument()
      const phone10 = mobileGrid().querySelector('[aria-label^="2026-08-10"]')
      expect(within(phone10).getByRole('img', { name: '2 of 3 on special leave' })).toBeInTheDocument()
      expect(within(phone10).queryByText('Ellis')).not.toBeInTheDocument()
      expect(phone10.className).toContain('min-h-[44px]')
    })

    it('marks a public holiday on the grid', () => {
      renderWorkspace()
      expect(within(desktopDay('2026-08-09')).getByText("Women's Day")).toBeInTheDocument()
      expect(desktopDay('2026-08-09').className).toContain('ring-ink')
    })

    // Consultant privacy (EC_LEAVE_PLANNER_RULES.md) — on the grid itself,
    // not just in the day card.
    it("hides a Consultant's leave from a non-admin, in the grid and the day card, but still counts the slot", async () => {
      mockAuth = { isAdmin: false, canSubmitLeave: true }
      const user = userEvent.setup()
      renderWorkspace()
      const day10 = desktopDay('2026-08-10')
      expect(within(day10).getByText('Ellis')).toBeInTheDocument()
      expect(within(day10).queryByText('Vance')).not.toBeInTheDocument()
      const card = await selectDay(user, '2026-08-10')
      expect(card.queryByText('Vance')).not.toBeInTheDocument()
      expect(card.getByText('2 of 3 on special leave')).toBeInTheDocument()
    })
  })

  describe('toolbar and panel', () => {
    it('has the shared toolbar: one Overview link, a name search, the legend trigger and the guideline key', async () => {
      const user = userEvent.setup()
      const onBack = vi.fn()
      renderWorkspace({ onBack })
      const toolbar = within(screen.getByTestId('planner-toolbar'))
      expect(toolbar.getAllByRole('button', { name: 'Overview' })).toHaveLength(1)
      expect(toolbar.getAllByRole('button', { name: 'Legend' })).toHaveLength(1)
      expect(screen.getByTestId('guideline-key')).toHaveTextContent('0 on leave')
      expect(screen.getByTestId('guideline-key')).toHaveTextContent('3+ on leave')
      await user.type(toolbar.getByRole('searchbox', { name: 'Search name' }), 'ell')
      expect(within(desktopDay('2026-08-10')).getByText('Ellis')).toBeInTheDocument()
      expect(within(desktopDay('2026-08-10')).queryByText('Vance')).not.toBeInTheDocument()
      // The pips are the true count whatever the search.
      expect(within(desktopDay('2026-08-10')).getByRole('img', { name: '2 of 3 on special leave' })).toBeInTheDocument()
      await user.click(toolbar.getByRole('button', { name: 'Overview' }))
      expect(onBack).toHaveBeenCalled()
    })

    it('one panel: eyebrow, the month stepper as the only period control, Showing, the days-with-room headline, the guideline bar, one filled button', () => {
      renderWorkspace()
      const panel = screen.getByTestId('planner-request-panel')
      expect(panel).toHaveTextContent('Special leave · Month')
      expect(within(panel).getByRole('button', { name: /^August 2026, jump to month or year/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
      expect(within(panel).getByLabelText('Showing')).toBeInTheDocument()
      // Nothing in the fixture reaches three doctors on one day.
      expect(panel).toHaveTextContent('31')
      expect(panel).toHaveTextContent('of 31 days have room')
      // The fixture is keyed by day: only the 10th carries entries.
      expect(within(panel).getByText('30 days · 0 of 3 used')).toBeInTheDocument()
      expect(within(panel).getByText('0 days · 1 of 3').closest('li')).toHaveClass('text-ink-muted/60')
      expect(within(panel).getByText('1 day · 2 of 3')).toBeInTheDocument()
      expect(within(panel).getByText('0 days · at guideline').closest('li')).toHaveClass('text-ink-muted/60')
      expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
      expect(panel.parentElement).toHaveClass('order-1', 'lg:sticky', 'lg:top-4', 'lg:w-80')
    })

    it('counts a day at the guideline in the bar and the headline', () => {
      const pressured = new Map([['2026-08-10', [
        entry('p1', 'study', '2026-08-10', '2026-08-10', 'approved', 'Ellis'),
        entry('p2', 'workshop', '2026-08-10', '2026-08-10', 'approved', 'Stone'),
        entry('p3', 'conference', '2026-08-10', '2026-08-10', 'approved', 'Vance'),
      ]]])
      renderWorkspace({ leaveByDate: pressured })
      const panel = screen.getByTestId('planner-request-panel')
      expect(panel).toHaveTextContent('30')
      expect(panel).toHaveTextContent('of 31 days have room')
      expect(within(panel).getByText('1 day · at guideline').closest('li')).not.toHaveClass('text-ink-muted/60')
    })

    it('the Showing picker opens on the viewer\'s own group and narrows the names, never the pips or the day card', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: true, profile: { category: 'MO' } }
      const user = userEvent.setup()
      renderWorkspace()
      expect(within(desktopDay('2026-08-10')).getByText('Ellis')).toBeInTheDocument()
      expect(within(desktopDay('2026-08-10')).queryByText('Vance')).not.toBeInTheDocument()
      expect(within(desktopDay('2026-08-10')).getByRole('img', { name: '2 of 3 on special leave' })).toBeInTheDocument()

      await user.click(screen.getByLabelText('Showing'))
      await user.click(await screen.findByRole('option', { name: 'All categories' }))
      expect(within(desktopDay('2026-08-10')).getByText('Vance')).toBeInTheDocument()

      const card = await selectDay(user, '2026-08-10')
      expect(card.getByText('Vance')).toBeInTheDocument()
      expect(card.getByText('Ellis')).toBeInTheDocument()
    })

    it('Request special leave opens the form on a sensible date with the type leading on Special leave', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      await user.click(screen.getByRole('button', { name: 'Request special leave' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('button', { name: 'Special leave' })).toBeInTheDocument()
      expect(within(dialog).getByLabelText('From')).toHaveValue('2026-08-01')
    })

    it('hides every request action from a viewer who cannot submit leave', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false }
      const user = userEvent.setup()
      renderWorkspace()
      expect(screen.queryByRole('button', { name: 'Request special leave' })).not.toBeInTheDocument()
      await selectDay(user, '2026-08-12')
      expect(screen.queryByRole('button', { name: 'Request leave from this day' })).not.toBeInTheDocument()
    })
  })

  describe('selected day', () => {
    it('rests on the empty message until a day is picked, then reads the day in the rail card', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      const card = screen.getByTestId('planner-details-card')
      expect(card).toHaveTextContent('Selected day')
      expect(card).toHaveTextContent('Select a day to see details.')
      await user.click(desktopDay('2026-08-10'))
      expect(desktopDay('2026-08-10')).toHaveAttribute('aria-pressed', 'true')
      expect(within(card).getByRole('heading', { name: 'Monday, 10 Aug 2026' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('reads the day against the guideline, with the full period, type and status per person', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      const card = await selectDay(user, '2026-08-10')
      expect(card.getByText('2 of 3 on special leave')).toBeInTheDocument()
      expect(card.getByText(/It is not a cap/)).toBeInTheDocument()
      expect(card.getByText('Ellis')).toBeInTheDocument()
      expect(card.getByText(/MO · Maternity · /)).toBeInTheDocument()
      expect(card.getByText('Pending review')).toBeInTheDocument()
      expect(card.getByText('Approved')).toBeInTheDocument()
    })

    it('words a free day, a day at the guideline and one past it', async () => {
      const user = userEvent.setup()
      const ids = n => Array.from({ length: n }, (_, i) => entry(`p${i}`, 'study', '2026-08-20', '2026-08-20', 'approved', `S${i}`))
      const byDate = new Map([['2026-08-20', ids(3)], ['2026-08-21', ids(4).map(e => ({ ...e, dateFrom: '2026-08-21', dateTo: '2026-08-21' }))]])
      renderWorkspace({ leaveByDate: byDate })
      let card = await selectDay(user, '2026-08-12')
      expect(card.getByText('Free · 0 of 3 on special leave')).toBeInTheDocument()
      expect(card.getByText('No one is on special leave today.')).toBeInTheDocument()
      card = await selectDay(user, '2026-08-20')
      expect(card.getByText('At guideline · 3 of 3 on special leave')).toBeInTheDocument()
      card = await selectDay(user, '2026-08-21')
      expect(card.getByText('Over guideline · 4 on special leave, guideline 3')).toBeInTheDocument()
      expect(within(desktopDay('2026-08-21')).getByRole('img', { name: '4 of 3 on special leave' })).toHaveTextContent('+1')
    })

    it('always offers an outlined request action for the day, since the guideline is not a cap', async () => {
      const user = userEvent.setup()
      const full = new Map([['2026-08-20', ['a', 'b', 'c'].map(id => entry(id, 'study', '2026-08-20', '2026-08-20', 'approved', id))]])
      renderWorkspace({ leaveByDate: full })
      const card = await selectDay(user, '2026-08-20')
      const action = card.getByRole('button', { name: 'Request leave from this day' })
      expect(action).toHaveClass('btn-secondary')
      await user.click(action)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText('From')).toHaveValue('2026-08-20')
      expect(within(dialog).getByRole('button', { name: 'Special leave' })).toBeInTheDocument()
    })

    it('keeps the selected day in the URL and reopens it from there', () => {
      renderWorkspace({}, '/leave?sday=2026-08-10')
      expect(desktopDay('2026-08-10')).toHaveAttribute('aria-pressed', 'true')
      expect(details().getByText('Ellis')).toBeInTheDocument()
    })

    it('below lg the day opens in a bottom sheet, not a centred popup', async () => {
      const mql = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
      window.matchMedia = vi.fn().mockReturnValue(mql)
      try {
        const user = userEvent.setup()
        renderWorkspace()
        expect(screen.queryByTestId('planner-details-card')).not.toBeInTheDocument()
        await user.click(desktopDay('2026-08-10'))
        const sheet = await screen.findByRole('dialog', { name: 'Selected day' })
        expect(within(sheet).getByText('Ellis')).toBeInTheDocument()
        await user.click(within(sheet).getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      } finally {
        delete window.matchMedia
      }
    })
  })

  // The guideline banner that used to sit above the grid stays gone: the
  // panel's bar and the day card say what the month and the day are at.
  it('has no capacity banner above the grid', () => {
    renderWorkspace()
    expect(screen.queryByText(/shared guideline/)).not.toBeInTheDocument()
    expect(screen.queryByText(/counted under/)).not.toBeInTheDocument()
  })
})
