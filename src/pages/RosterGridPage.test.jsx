import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RosterGridPage from './RosterGridPage'

// August 2026 roster with: a public holiday on Sun 9 / Mon 10, a shortfall
// flag on Wed 26, Thu 27 and Fri 28 (the three consecutive red cells the
// day-block layout exists to keep apart), and a consultant on Mon 3.
let mockAuth = { isAdmin: true, isLocum: false, user: { id: 'admin-1' } }
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))
vi.mock('../lib/changeLog', () => ({ logRosterEntryChange: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/weekendPatternSync', () => ({ syncWeekendPatternsFromEntries: vi.fn() }))
vi.mock('../components/RosterLanesView', () => ({ default: () => null, LanesLegend: () => null }))

const SHIFT_TYPES = ['WD_08', 'WD_12', 'WD_15', 'WD_22', 'WE_08', 'WE_13', 'WE_20', 'PHW_08', 'PHW_12', 'PHW_15', 'PHW_22', 'PH_08', 'PH_13', 'PH_20']
  .map((code, i) => ({ id: `st${i}`, code }))
const st = code => SHIFT_TYPES.find(s => s.code === code).id
const PROFILES = [
  { id: 'p1', name: 'Alice', surname: 'Anderson', category: 'MO', color_code: '#2563EB', is_active: true },
]
const CONSULTANTS = [{ id: 'c1', name: 'Dee', surname: 'De Haan', color_code: '#0F766E' }]
const ENTRIES = [
  { id: 'e1', date: '2026-08-26', shift_type_id: st('WD_12'), profile_id: 'p1', is_flagged: true, position: 0 },
  { id: 'e2', date: '2026-08-27', shift_type_id: st('WD_12'), profile_id: 'p1', is_flagged: true, position: 0 },
  { id: 'e3', date: '2026-08-28', shift_type_id: st('WD_12'), profile_id: 'p1', is_flagged: true, position: 0 },
  { id: 'e4', date: '2026-08-03', shift_type_id: st('WD_08'), profile_id: null, consultant_profile_id: 'c1', position: 0 },
  // An empty placeholder with no flag, as a roster loaded from elsewhere has.
  { id: 'e7', date: '2026-08-14', shift_type_id: st('WD_08'), profile_id: null, is_locum: true, locum_name: '[ ]', position: 0 },
  // A named locum placeholder, and a scheduler gap it couldn't fill.
  { id: 'e5', date: '2026-08-12', shift_type_id: st('WD_15'), profile_id: null, is_locum: true, locum_name: '[Nel]', position: 0 },
  { id: 'e6', date: '2026-08-13', shift_type_id: st('WD_08'), profile_id: null, is_locum: true, locum_name: '[ ]', is_flagged: true, flag_type: 'psych_coverage', flag_reason: 'No COSMO Psych or EC COSMO available', position: 0 },
]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let single = false
      let filters = []
      const builder = {
        select() { return builder },
        update() { return builder },
        insert() { return builder },
        delete() { return builder },
        eq(col, val) { filters.push([col, val]); return builder },
        neq() { return builder },
        gte() { return builder },
        lte() { return builder },
        order() { return builder },
        single() { single = true; return builder },
        then(resolve, reject) {
          let data = []
          if (table === 'roster_months') data = { id: 'rm1', year: 2026, month: 8, status: 'draft' }
          if (table === 'roster_entries') data = ENTRIES
          if (table === 'profiles') data = filters.some(([c, v]) => c === 'category' && v === 'Consultant') ? CONSULTANTS : PROFILES
          if (table === 'shift_types') data = single ? SHIFT_TYPES[0] : SHIFT_TYPES
          if (table === 'public_holidays') data = [{ date: '2026-08-09', name: "Women's Day" }, { date: '2026-08-10', name: 'Public holiday' }]
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

function setViewport(matches) {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })
}

function renderPage(path = '/roster/rm1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/roster/:id" element={<RosterGridPage />} /></Routes>
    </MemoryRouter>
  )
}

const rowFor = date => document.querySelector(`[data-date="${date}"]`)

describe('RosterGridPage day blocks', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0, 0))
    setViewport(true)
  })

  it('a "Go to roster" link (?date=) scrolls to that day once the roster has loaded', async () => {
    const scrolled = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this.getAttribute('data-date')) }
    try {
      renderPage('/roster/rm1?date=2026-08-20&doctor=nobody')
      await screen.findByText('August 2026')
      await waitFor(() => expect(scrolled).toContain('2026-08-20'))
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('a "Go to roster" link with a doctor scrolls to and lights that doctor\'s shift', async () => {
    const scrolled = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this.getAttribute('data-entry-id')) }
    try {
      renderPage('/roster/rm1?date=2026-08-27&doctor=p1')
      await screen.findByText('August 2026')
      await waitFor(() => expect(scrolled).toContain('e2'))
      expect(document.querySelector('[data-entry-id="e2"]').className).toMatch(/ring-2/)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('separates days with a page-background gap: 6px between days, 14px before a Monday, none above the first', async () => {
    renderPage()
    await screen.findByText('August 2026')
    const rows = [...document.querySelectorAll('tbody > tr')]
    expect(rows[0]).toHaveAttribute('data-date', '2026-08-01')
    expect(rows[0].previousElementSibling).toBeNull()
    const gaps = screen.getAllByTestId('day-gap')
    expect(gaps).toHaveLength(30)
    const gapBefore = date => rowFor(date).previousElementSibling
    expect(gapBefore('2026-08-02')).toHaveClass('h-[6px]')
    expect(gapBefore('2026-08-03')).toHaveClass('h-[14px]') // Monday
    expect(gapBefore('2026-08-10')).toHaveClass('h-[14px]') // a PH Monday is still a week boundary
    // No outer frame: the scroll wrapper carries no border, each block does.
    const wrapper = document.querySelector('.overflow-x-auto')
    expect(wrapper.className).not.toMatch(/border/)
    expect(rowFor('2026-08-04').firstElementChild).toHaveClass('border-l', 'border-y', 'border-slate-line')
    expect(rowFor('2026-08-04').lastElementChild).toHaveClass('border-r', 'border-y')
  })

  it('fills the date rail per day type, pinned to the top, with today outlined in the accent', async () => {
    renderPage()
    await screen.findByText('August 2026')
    const rail = date => rowFor(date).firstElementChild
    expect(rail('2026-08-04')).toHaveClass('bg-day-rail', 'align-top')
    expect(rail('2026-08-08')).toHaveClass('bg-accent-light')
    expect(rail('2026-08-09')).toHaveClass('bg-rose-night')
    expect(within(rail('2026-08-09')).getByText("Women's Day")).toBeInTheDocument()
    for (const cell of rowFor('2026-08-05').children) expect(cell).toHaveClass('border-accent')
    expect(rail('2026-08-04')).not.toHaveClass('border-accent')
  })

  it('keeps a flag fill on the inset inner block, never on the cell or its header', async () => {
    renderPage()
    await screen.findByText('August 2026')
    for (const date of ['2026-08-26', '2026-08-27', '2026-08-28']) {
      const row = rowFor(date)
      const tds = [...row.querySelectorAll('td')]
      expect(tds.some(td => td.className.includes('flagRed'))).toBe(false)
      const flagged = [...row.querySelectorAll('[data-testid="shift-cell"]')].filter(el => el.className.includes('ring-flagRed'))
      expect(flagged).toHaveLength(1)
      expect(flagged[0]).toHaveClass('m-[3px]', 'rounded', 'ring-2')
      expect(within(flagged[0]).getByTestId('flag-tab')).toHaveTextContent('Short by 1')
    }
    // Mon 24 opens the weekday block, so its header band sits above; it is
    // not tinted by the flags lower in the same column.
    const header = within(rowFor('2026-08-24')).getByText('WD 12h-22h')
    expect(header.className).not.toMatch(/flagRed|flagAmber/)
  })

  it('at md and above the Consultant column is present and the rail has no consultant', async () => {
    renderPage()
    await screen.findByText('August 2026')
    expect(screen.getAllByText('Consultant').length).toBeGreaterThan(0)
    expect(within(rowFor('2026-08-03')).getByTestId('consultant-cell')).toHaveTextContent('De Haan')
    expect(screen.queryByTestId('rail-consultant')).not.toBeInTheDocument()
    expect(rowFor('2026-08-03').firstElementChild).not.toHaveClass('sticky')
  })

  it('below md the Consultant column is gone, the consultant sits under the date in a pinned rail, and an admin can still change it', async () => {
    setViewport(false)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('August 2026')
    expect(screen.queryByText('Consultant')).not.toBeInTheDocument()
    expect(screen.queryByTestId('consultant-cell')).not.toBeInTheDocument()
    const rail = rowFor('2026-08-03').firstElementChild
    expect(rail).toHaveClass('sticky', 'left-0', 'border-r')
    expect(within(rail).getByTestId('rail-consultant')).toHaveTextContent('De Haan')
    // Four shift columns + rail, no empty sixth column.
    expect(document.querySelectorAll('colgroup col')).toHaveLength(5)
    // Admin (editing) taps the consultant to open the picker.
    mockAuth = { isAdmin: true, isLocum: false, user: { id: 'admin-1' } }
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(within(rail).getByText('De Haan'))
    expect(await screen.findByRole('dialog', { name: /Assign doctor — Consultant on 2026-08-03/ })).toBeInTheDocument()
  })
})

describe('RosterGridPage flagged slots and locum placeholders', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0, 0))
    setViewport(true)
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows a scheduler gap as a red "Unfilled" chip under a tab naming why, and a locum cell without a fill', async () => {
    renderPage()
    await screen.findByText('August 2026')
    const gapCell = within(rowFor('2026-08-13')).getAllByTestId('shift-cell').find(c => c.className.includes('ring-flagRed'))
    expect(within(gapCell).getByText('Unfilled')).toBeInTheDocument()
    expect(within(gapCell).getByTestId('flag-tab')).toHaveTextContent('No psych cover')
    const locumCell = within(rowFor('2026-08-12')).getByText('[Nel]').closest('[data-testid="shift-cell"]')
    expect(locumCell.className).not.toMatch(/flagAmber|flagRed/)
  })

  it('counts flagged slots and locum placeholders separately, as jump buttons in the toolbar', async () => {
    renderPage()
    await screen.findByText('August 2026')
    expect(screen.getByRole('button', { name: 'Go to next flagged slot (5 in total)' })).toHaveTextContent('5 flagged')
    expect(screen.getByRole('button', { name: 'Go to next locum placeholder (1 in total)' })).toHaveTextContent('1 locum')
    expect(screen.queryByText(/flagged slots?$/)).not.toBeInTheDocument()
  })

  it('jumping steps through flagged slots in roster order, scrolls to each, and shows the position', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('August 2026')
    await user.click(screen.getByRole('button', { name: /Go to next flagged slot/ }))
    expect(screen.getByRole('button', { name: /Go to next flagged slot/ })).toHaveTextContent('Flagged 1/5')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(document.querySelector('[data-entry-id="e6"]').className).toMatch(/ring-flagRed/)
    await user.click(screen.getByRole('button', { name: 'Previous flagged slot' }))
    expect(screen.getByRole('button', { name: /Go to next flagged slot/ })).toHaveTextContent('Flagged 5/5')
  })

  it('"Show only" in the Filter dims every cell without a match', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('August 2026')
    await user.click(screen.getAllByRole('button', { name: 'Filter' })[0])
    await user.click(screen.getByRole('button', { name: /^Show only/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Locum placeholders (1)' }))
    const locumCell = within(rowFor('2026-08-12')).getByText('[Nel]').closest('[data-testid="shift-cell"]')
    expect(locumCell).not.toHaveClass('opacity-25')
    const other = within(rowFor('2026-08-26')).getAllByTestId('shift-cell')[0]
    expect(other).toHaveClass('opacity-25')
  })
})

describe('RosterGridPage month switch', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0, 0))
    setViewport(true)
  })

  it('the title is a month stepper; a month with no roster says so and stays on this one', async () => {
    const user = userEvent.setup()
    renderPage()
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('August 2026')
    await user.click(within(heading).getByRole('button', { name: /next/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('No roster for September 2026 yet.')
    expect(heading).toHaveTextContent('August 2026')
  })
})

describe('RosterGridPage unflagged empty placeholders', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0, 0))
    setViewport(true)
  })

  it('an unnamed locum placeholder with no flag is still shown and counted as unfilled, not as a locum', async () => {
    renderPage()
    await screen.findByText('August 2026')
    const cell = document.querySelector('[data-entry-id="e7"]').closest('[data-testid="shift-cell"]')
    expect(cell.className).toMatch(/ring-flagRed/)
    expect(within(cell).getByText('Unfilled')).toBeInTheDocument()
    expect(within(cell).getByTestId('flag-tab')).toHaveTextContent('Short by 1')
    expect(screen.getByRole('button', { name: 'Go to next locum placeholder (1 in total)' })).toBeInTheDocument()
  })
})
