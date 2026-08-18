import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import WeekendPlannerView from './WeekendPlannerView'
import { isEvenWeekend } from '../lib/weekendPlanner'

// Fixtures below assume "today" is 2026-08-01 (a Saturday) — pinned via
// vi.setSystemTime in beforeEach rather than relying on the real wall-clock
// date, which would otherwise silently break this suite (built entirely
// around current/next-weekend logic) once the real date moved past it.
let mockAuth = { isAdmin: false, canSubmitLeave: true, profile: { id: 'p1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const restoreWeekendPlannerBatch = vi.fn()
vi.mock('../lib/changeLog', () => ({
  logWeekendPlannerChange: vi.fn().mockResolvedValue(undefined),
  restoreWeekendPlannerBatch: (...args) => restoreWeekendPlannerBatch(...args),
}))

vi.mock('./WeekendPlannerChangeLogModal', () => ({
  default: ({ onClose }) => <div>ChangeLogStub<button onClick={onClose}>close</button></div>,
}))

const PROFILES = [
  { id: 'p1', name: 'Alice', surname: 'Anderson', category: 'MO' },
  { id: 'p2', name: 'Bob', surname: 'Botha', category: 'Registrar' },
  { id: 'p3', name: 'Carol', surname: 'Cosmo', category: 'COSMO' },
  { id: 'p4', name: 'Dan', surname: 'Della', category: 'COSMOPsych' },
  // A second Registrar, unrostered anywhere in ENTRIES — exists purely so
  // the multi-select add-sheet test has two real candidates for one
  // category to select together.
  { id: 'p5', name: 'Erin', surname: 'Eaton', category: 'Registrar' },
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
// they're NOT rostered for, so it only shows up under "My requests", not
// "My weekends".
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
        in() { return builder },
        gte() { return builder },
        lte() { return builder },
        single() { return builder },
        order() { return builder },
        then(resolve, reject) {
          if (method === 'insert') {
            // Bulk inserts (Copy/Paste) pass an array; single-row inserts
            // (addEntry) pass a plain object and chain .select().single() —
            // this mock doesn't need to distinguish those chain calls,
            // just shape the resolved data to match what was inserted.
            if (Array.isArray(lastArgs)) {
              const rows = lastArgs.map(a => ({ id: `new-${insertedRows.length}-${a.profile_id}`, ...a }))
              insertedRows.push(...rows)
              return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
            }
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

// WeekendPlanner.jsx (the real orchestrator) now owns clipboard state and
// passes it down as controlled props — this stands in for it so the
// Copy/Paste suite below still exercises real state updates rather than a
// no-op setClipboard.
function Harness(props) {
  const [clipboard, setClipboard] = useState(null)
  return <WeekendPlannerView {...props} clipboard={clipboard} setClipboard={setClipboard} />
}

function renderView(props) {
  return render(<Harness {...props} />, { wrapper: MemoryRouter })
}

// jsdom doesn't evaluate CSS media queries or Tailwind responsive classes
// (`lg:hidden` / `hidden lg:block`), so BOTH the mobile card layout and the
// desktop workspace render into the DOM simultaneously in every test
// regardless of viewport. Every query must be scoped to one section's
// data-testid or it'll hit "multiple elements found" against the other
// layout's copy of the same weekend/date text. findByTestId (not
// getByTestId) is used here because the section doesn't exist yet while
// `loading` is still true right after render.
async function mobile() {
  return within(await screen.findByTestId('weekend-mobile'))
}
async function desktop() {
  return within(await screen.findByTestId('weekend-desktop'))
}
// Scopes a query to the mobile month-list itself, excluding the "Next
// weekend"/"Next weekend needing staff" summary panels above it — those can
// echo the same weekend's date text (e.g. when the literal next weekend is
// also the nearest one still needing staff), which would otherwise throw
// off a plain index-based lookup for "the list's own card".
function list(view) {
  return within(view.getByTestId('weekend-mobile-list'))
}

// Filter is now the shared Toolbar's single-select quick-pill facet (see
// Toolbar.jsx's ToolbarFacet) — collapsed behind one "Filter" trigger
// rather than always-visible chips, so picking an option is a two-step
// open-then-pick. Toolbar is now rendered once per viewport (its own row on
// mobile, merged into the nav row on desktop — see WeekendPlannerView's
// renderToolbar), so the trigger itself needs scoping to `view` the same as
// every other duplicated-per-viewport control; the popped-open option list
// is a portal straight onto document.body regardless, so that half still
// queries `screen` directly.
async function pickFilter(view, user, label) {
  await user.click(view.getByRole('button', { name: 'Filter' }))
  await user.click(await screen.findByRole('button', { name: label }))
}

async function showAll(view, user) {
  await pickFilter(view, user, 'All weekends')
}

// Bulk Copy/Clear month+quarter now live behind desktop's "More Actions"
// trigger (the same menu mobile's ⋮ opens) rather than 4 always-visible
// buttons — opens it, clicks the action by its label, and returns (the
// menu closes itself on click, same as every ActionSheet action here).
async function clickMoreAction(user, label) {
  await user.click(screen.getByRole('button', { name: 'More Actions' }))
  await user.click(await screen.findByRole('button', { name: label }))
}

describe('WeekendPlannerView', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0))
    insertedRows.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    mockResponses['weekend_planner_entries:select'] = { data: ENTRIES, error: null }
    mockResponses['weekend_planner_entries:delete'] = { data: null, error: null }
    mockResponses['leave_requests:select'] = { data: MY_WEEKEND_REQUESTS, error: null }
    mockAuth = { isAdmin: false, canSubmitLeave: true, profile: { id: 'p1' } }
    restoreWeekendPlannerBatch.mockReset().mockResolvedValue({ error: null, inserted: 0, deleted: 0, skipped: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('mobile layout', () => {
    it('shows the Next weekend summary card with coverage and "on rotation" status', async () => {
      renderView()
      const view = await mobile()
      const heading = await view.findByText('Next weekend')
      const card = heading.closest('.card')
      expect(within(card).getByText('Sat 1 - Sun 2 Aug 2026')).toBeInTheDocument()
      expect(within(card).getByText(/1 of 4 groups staffed/)).toBeInTheDocument()
      expect(within(card).getByText(/Registrar, EC Intern, OT Intern still open/)).toBeInTheDocument()
      expect(within(card).getByText(/You.re on rotation this weekend/)).toBeInTheDocument()
      // 1 of 4 staffed — neither fully staffed nor empty — so amber, matching
      // the year overview's legend health, not the mobile cards' own parity fill.
      expect(card).toHaveClass('bg-flagAmber-bg')
    })

    it('the "Next weekend needing staff" panel never targets an already-passed weekend, even after navigating back to view a past month', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      // "Today" is now Sept 5 2026 — Aug 1 (only MO filled in ENTRIES) has
      // already passed, but seeding the view at August (as if an admin
      // navigated back to it) widens the fetch to include it again. Sept 5
      // is itself a Saturday with nothing planned.
      vi.setSystemTime(new Date(2026, 8, 5, 9, 0, 0))
      render(<Harness initialYear={2026} initialMonth={8} />, { wrapper: MemoryRouter })
      const view = await mobile()
      await view.findByText('August 2026')

      const heading = await view.findByText('Next weekend needing staff')
      const panel = heading.closest('.card')
      expect(within(panel).queryByText('Sat 1 - Sun 2 Aug 2026')).not.toBeInTheDocument()
      expect(within(panel).getByText('Sat 5 - Sun 6 Sept 2026')).toBeInTheDocument()
    })

    it('mobile: search and Filter share one non-wrapping row, and Filter renders icon-only', async () => {
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      // Toolbar's mobile trigger is named "Filters" (its default
      // mobileSheetTitle) — distinct from the desktop facet's "Filter". Now
      // that Toolbar itself is rendered once per viewport (mobile's own row
      // here, desktop's merged into its nav row), this still needs scoping
      // to `view` like everything else duplicated per viewport.
      const filterButton = view.getByRole('button', { name: 'Filters' })
      expect(within(filterButton).queryByText('Filters')).not.toBeInTheDocument() // icon only — name comes from aria-label, no visible text child
      expect(filterButton.className).toContain('w-[30px]')

      const row = filterButton.closest('div.md\\:hidden')
      expect(row.className).toContain('flex-nowrap')
      expect(row.className).not.toContain('flex-col')
    })

    it('mobile: Review log lives inside the More actions kebab, and still opens the review log', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'More actions' }))
      const menu = await screen.findByRole('dialog', { name: 'More actions' })
      await user.click(within(menu).getByRole('button', { name: 'Review log' }))
      expect(await screen.findByText('ChangeLogStub')).toBeInTheDocument()
    })

    it('mobile: the Legend trigger opens a sheet with "How it works" as its footer, not duplicated inside the More Actions menu', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'Legend and how it works' }))
      const sheet = await screen.findByRole('dialog', { name: 'Legend' })
      expect(within(sheet).getByText('How it works')).toBeInTheDocument()
      expect(within(sheet).getByText(/No more than one person per slot/)).toBeInTheDocument()
      expect(within(sheet).getByText('Fully planned')).toBeInTheDocument()
      await user.click(within(sheet).getByLabelText('Close'))

      await user.click(view.getByRole('button', { name: 'More actions' }))
      const menu = await screen.findByRole('dialog', { name: 'More actions' })
      expect(within(menu).queryByText(/No more than one person per slot/)).not.toBeInTheDocument()
    })

    it('defaults to the "My weekends" filter, leftmost of the chips', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'Filter' }))
      const chips = screen.getAllByRole('button', { name: /^(My weekends|My requests|All weekends|Needs planning)$/ })
      expect(chips.map(c => c.textContent)).toEqual(['My weekends', 'My requests', 'All weekends'])
      expect(screen.getByRole('button', { name: 'My weekends' })).toHaveClass('bg-accent')
      await user.keyboard('{Escape}')

      // Only p1's own two weekends show by default
      expect(view.getAllByText('Sat 1 - Sun 2 Aug 2026')).toHaveLength(2) // next-weekend card + list card
      expect(view.getByText('Sat 8 - Sun 9 Aug 2026')).toBeInTheDocument()
      expect(view.queryByText('Sat 15 - Sun 16 Aug 2026')).not.toBeInTheDocument()
    })

    it('renders one card per weekend in the current month once "All weekends" is selected, flagging incomplete coverage', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug8Heading = await view.findByText('Sat 8 - Sun 9 Aug 2026')
      const aug8Card = aug8Heading.closest('.card')
      expect(within(aug8Card).getByText('Complete')).toBeInTheDocument() // fully covered

      const aug15Heading = view.getByText('Sat 15 - Sun 16 Aug 2026')
      const aug15Card = aug15Heading.closest('.card')
      expect(within(aug15Card).getByText('Empty')).toBeInTheDocument() // nothing planned yet
    })

    it('cards always have a neutral white background — weekend parity is carried by the left border only', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      // 2026-08-01 is also the literal next weekend — scope to the list
      // itself, not the summary panels above it, to get its own card.
      const aug1Card = list(view).getByText('Sat 1 - Sun 2 Aug 2026').closest('.card')
      const aug8Card = view.getByText('Sat 8 - Sun 9 Aug 2026').closest('.card')
      expect(aug1Card.className).not.toMatch(/bg-accent-tint|bg-flagAmber-bg/)
      expect(aug8Card.className).not.toMatch(/bg-accent-tint|bg-flagAmber-bg/)

      const aug1IsEven = aug1Card.className.includes('border-l-groupEven')
      const aug8IsEven = aug8Card.className.includes('border-l-groupEven')
      expect(aug1IsEven).not.toBe(aug8IsEven)
      expect(aug1Card.className.includes('border-l-groupEven') || aug1Card.className.includes('border-l-groupOdd')).toBe(true)
      expect(aug8Card.className.includes('border-l-groupEven') || aug8Card.className.includes('border-l-groupOdd')).toBe(true)
    })

    it('the status pill reflects live coverage (Empty/N roles open/Complete) and is never a background fill', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug15Card = view.getByText('Sat 15 - Sun 16 Aug 2026').closest('.card')
      expect(aug15Card.className).not.toMatch(/bg-accent-tint|bg-flagAmber-bg|bg-flagRed-bg/)
      expect(within(aug15Card).getByText('Empty')).toHaveClass('bg-flagRed-bg', 'text-flagRed')

      // 2026-08-01: only MO filled, 3 groups open.
      const aug1Card = list(view).getByText('Sat 1 - Sun 2 Aug 2026').closest('.card')
      expect(within(aug1Card).getByText('3 roles open')).toHaveClass('bg-flagAmber-bg', 'text-flagAmber')
    })

    it('assigned names are neutral ink-coloured (not tinted by parity), and unfilled roles show a tappable amber Open pill', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug8Card = view.getByText('Sat 8 - Sun 9 Aug 2026').closest('.card')
      expect(within(aug8Card).getByRole('button', { name: 'Anderson' })).toHaveClass('text-ink')

      const aug15Card = view.getByText('Sat 15 - Sun 16 Aug 2026').closest('.card')
      const openPills = within(aug15Card).getAllByRole('button', { name: 'Open' })
      expect(openPills).toHaveLength(4)
      expect(openPills[0]).toHaveClass('bg-flagAmber-bg', 'text-flagAmber')
    })

    it('disambiguates two doctors sharing a surname with a first initial', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      mockResponses['profiles:select'] = {
        data: [
          ...PROFILES,
          { id: 'p6', name: 'James', surname: 'Nolan', category: 'Registrar' },
          { id: 'p7', name: 'Priya', surname: 'Nolan', category: 'Registrar' },
        ],
        error: null,
      }
      mockResponses['weekend_planner_entries:select'] = {
        data: [
          ...ENTRIES,
          { id: 'e7', weekend_saturday: '2026-08-15', profile_id: 'p6', category: 'Registrar' },
          { id: 'e8', weekend_saturday: '2026-08-15', profile_id: 'p7', category: 'Registrar' },
        ],
        error: null,
      }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug15Card = view.getByText('Sat 15 - Sun 16 Aug 2026').closest('.card')
      // Bare "Nolan" would be ambiguous between the two — every other
      // doctor's surname stays untouched (Anderson, unaffected by this
      // unrelated collision, still shows plain).
      expect(within(aug15Card).getByText('J. Nolan')).toBeInTheDocument()
      expect(within(aug15Card).getByText('P. Nolan')).toBeInTheDocument()
      expect(within(aug15Card).queryByText('Nolan')).not.toBeInTheDocument()
      const aug8Card = view.getByText('Sat 8 - Sun 9 Aug 2026').closest('.card')
      expect(within(aug8Card).getByText('Anderson')).toBeInTheDocument()
    })

    it('"Needs planning" filter (admin-only) hides fully-covered weekends', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await pickFilter(view, user, 'Needs planning')
      expect(view.queryByText('Sat 8 - Sun 9 Aug 2026')).not.toBeInTheDocument()
      expect(view.getByText('Sat 15 - Sun 16 Aug 2026')).toBeInTheDocument()
    })

    it('admin: "All weekends" leads the filter chips, ahead of "My weekends"', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'Filter' }))
      const chips = screen.getAllByRole('button', { name: /^(My weekends|My requests|All weekends|Needs planning)$/ })
      expect(chips.map(c => c.textContent)).toEqual(['All weekends', 'My weekends', 'My requests', 'Needs planning'])
    })

    it('admin: lands on "All weekends" by default; non-admin still lands on "My weekends"', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await user.click(view.getByRole('button', { name: 'Filter' }))
      expect(screen.getByRole('button', { name: 'All weekends' })).toHaveClass('bg-accent')
      expect(screen.getByRole('button', { name: 'My weekends' })).not.toHaveClass('bg-accent')
    })

    it('non-admin: "Needs planning" filter does not exist', async () => {
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      expect(view.queryByRole('button', { name: 'Needs planning' })).not.toBeInTheDocument()
    })

    it('"My weekends" filter shows only weekends the signed-in doctor is assigned to', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      await pickFilter(view, user, 'My weekends')

      expect(view.getByText('Sat 8 - Sun 9 Aug 2026')).toBeInTheDocument() // p1 assigned
      expect(view.queryByText('Sat 15 - Sun 16 Aug 2026')).not.toBeInTheDocument() // nobody assigned
    })

    it('"My requests" filter shows weekends with the doctor\'s own weekend-exception request, with a status badge', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await pickFilter(view, user, 'My requests')
      const aug22Heading = await view.findByText('Sat 22 - Sun 23 Aug 2026')
      expect(view.queryByText('Sat 8 - Sun 9 Aug 2026')).not.toBeInTheDocument() // in My weekends, not My requests
      expect(within(aug22Heading.closest('.card')).getByText('Exception pending')).toBeInTheDocument()
    })

    it('month navigation moves forward, and back again past the starting month — browsing is unbounded, like the year overview', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      // Previous/Next are never disabled — the fetch window follows
      // navigation instead of gating it (see WeekendPlannerView's own
      // fetchBounds/goToMonth comments).
      expect(view.getByRole('button', { name: 'Previous month' })).not.toBeDisabled()
      await user.click(view.getByRole('button', { name: 'Next month' }))

      expect(await view.findByText('September 2026')).toBeInTheDocument()
      // en-GB's short month name for September is "Sept" (4 letters), not "Sep".
      expect(view.getByText('Sat 5 - Sun 6 Sept 2026')).toBeInTheDocument()
      expect(view.queryByText('Sat 8 - Sun 9 Aug 2026')).not.toBeInTheDocument()

      // Stepping back past August (the starting/current month) into July —
      // previously impossible, since the old rolling fetch window floored
      // at "today" and never widened again. This crosses out of the
      // currently-loaded window, which triggers a refetch (the whole
      // section briefly unmounts behind "Loading…" — see WeekendPlannerView's
      // own loading-gate render), so re-scope queries to a freshly-found
      // section afterward rather than reusing the pre-reload `view`.
      await user.click(view.getByRole('button', { name: 'Previous month' }))
      await user.click(view.getByRole('button', { name: 'Previous month' }))
      // Both viewports render in jsdom (see this file's own top comment), so
      // "July 2026" now matches twice (mobile + desktop nav) — findAllByText
      // just to wait out the reload, then re-scope to mobile below.
      await screen.findAllByText('July 2026')
      const viewAfterReload = await mobile()
      expect(viewAfterReload.getByText('July 2026')).toBeInTheDocument()
      expect(viewAfterReload.getByRole('button', { name: 'Previous month' })).not.toBeDisabled()
    })

    it('non-admin: no add/remove controls on any card', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      await view.findByText('Sat 8 - Sun 9 Aug 2026')
      expect(view.queryByRole('button', { name: 'Add doctor' })).not.toBeInTheDocument()
      expect(view.queryByLabelText(/Remove/)).not.toBeInTheDocument()
    })

    it('displays surnames only, not full names, in the grid', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug8Card = (await view.findByText('Sat 8 - Sun 9 Aug 2026')).closest('.card')
      expect(within(aug8Card).getByText('Anderson')).toBeInTheDocument()
      expect(within(aug8Card).queryByText('Alice Anderson')).not.toBeInTheDocument()
    })

    it('admin: can remove an assigned doctor from a weekend via the remove sheet', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug1Card = list(view).getByText('Sat 1 - Sun 2 Aug 2026').closest('.card')
      await user.click(within(aug1Card).getByRole('button', { name: 'Anderson' }))

      await user.click(await screen.findByRole('button', { name: 'Remove from this weekend' }))
      await waitFor(() => expect(within(aug1Card).queryByRole('button', { name: 'Anderson' })).not.toBeInTheDocument())
    })

    it('admin: can add a doctor to an open slot via the doctor-add sheet (Open pill)', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug15Heading = await view.findByText('Sat 15 - Sun 16 Aug 2026')
      const aug15Card = aug15Heading.closest('.card')

      await user.click(within(aug15Card).getAllByRole('button', { name: 'Open' })[0]) // MO row
      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      expect(within(sheet).getByRole('combobox', { name: 'Category' })).toHaveValue('MO')
      await user.click(within(sheet).getByRole('checkbox', { name: /Alice Anderson/ }))
      await user.click(within(sheet).getByRole('button', { name: /Add 1 doctor/ }))

      expect(await within(aug15Card).findByText('Anderson')).toBeInTheDocument()
    })

    it('admin: can add a doctor to a specific open role by tapping its Open pill', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug15Card = (await view.findByText('Sat 15 - Sun 16 Aug 2026')).closest('.card')

      await user.click(within(aug15Card).getAllByRole('button', { name: 'Open' })[1]) // Registrar row
      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      expect(within(sheet).getByRole('combobox', { name: 'Category' })).toHaveValue('Registrar')
      await user.click(within(sheet).getByRole('checkbox', { name: /Bob Botha/ }))
      await user.click(within(sheet).getByRole('button', { name: /Add 1 doctor/ }))

      expect(await within(aug15Card).findByText('Botha')).toBeInTheDocument()
    })

    it('admin: can select several doctors at once and add them in a single submit', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug15Card = (await view.findByText('Sat 15 - Sun 16 Aug 2026')).closest('.card')

      await user.click(within(aug15Card).getAllByRole('button', { name: 'Open' })[1]) // Registrar row
      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      await user.click(within(sheet).getByRole('checkbox', { name: /Bob Botha/ }))
      await user.click(within(sheet).getByRole('checkbox', { name: /Erin Eaton/ }))
      await user.click(within(sheet).getByRole('button', { name: /Add 2 doctors/ }))

      expect(await within(aug15Card).findByText('Botha')).toBeInTheDocument()
      expect(within(aug15Card).getByText('Eaton')).toBeInTheDocument()
    })

    it('the doctor-add sheet lets the admin switch category, refreshing the candidate list', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug15Card = (await view.findByText('Sat 15 - Sun 16 Aug 2026')).closest('.card')

      await user.click(within(aug15Card).getAllByRole('button', { name: 'Open' })[0]) // MO row
      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      expect(within(sheet).getByRole('checkbox', { name: /Alice Anderson/ })).toBeInTheDocument()

      await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Category' }), 'Registrar')
      expect(within(sheet).queryByRole('checkbox', { name: /Alice Anderson/ })).not.toBeInTheDocument()
      expect(within(sheet).getByRole('checkbox', { name: /Bob Botha/ })).toBeInTheDocument()
    })

    it('a filled category still offers a "+" to add another doctor, not just an empty one', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug1Card = list(view).getByText('Sat 1 - Sun 2 Aug 2026').closest('.card')

      // MO is already filled (Anderson) on Aug 1 — the "+" trigger should
      // still open the picker scoped to MO, not require clearing it first.
      await user.click(within(aug1Card).getByRole('button', { name: /Add another doctor to MO/ }))
      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      expect(within(sheet).getByRole('combobox', { name: 'Category' })).toHaveValue('MO')
    })

    it('doctor picker sheet flags an unresolved Intern/COSMO doctor (no covering rotation record) rather than guessing', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug15Card = (await view.findByText('Sat 15 - Sun 16 Aug 2026')).closest('.card')

      await user.click(within(aug15Card).getAllByRole('button', { name: 'Open' })[2]) // EC Intern (COSMO group) row
      const carolCheckbox = await screen.findByRole('checkbox', { name: /Carol Cosmo/ })
      expect(within(carolCheckbox.closest('label')).getByText('Needs rotation record')).toBeInTheDocument()
    })

    it('tapping a card\'s date opens a read-only quick-glance sheet, additive to (not replacing) the card\'s own inline breakdown', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug8Button = await view.findByRole('button', { name: 'Sat 8 - Sun 9 Aug 2026' })
      await user.click(aug8Button)

      // The sheet mounts as a sibling of the mobile section, not nested
      // inside it — its own heading (an <h2>, not the card's <button>)
      // scopes the assertions below.
      const heading = await screen.findByRole('heading', { name: 'Sat 8 - Sun 9 Aug 2026' })
      const sheet = heading.closest('.card')
      // Weekend-index numbering is relative to the fetched window, which
      // shifts as "today" moves forward — assert the parity label alone,
      // not a specific "Wknd N" number.
      expect(within(sheet).getByText(new RegExp(`Wknd \\d+ · ${isEvenWeekend('2026-08-08') ? 'Even' : 'Odd'}`))).toBeInTheDocument()
      expect(within(sheet).getByText('4 of 4 groups planned')).toBeInTheDocument()
      expect(within(sheet).getByText('Anderson')).toBeInTheDocument()
      expect(within(sheet).getByText('Botha')).toBeInTheDocument()
      expect(within(sheet).getByText('Cosmo')).toBeInTheDocument()
      expect(within(sheet).getByText('Della')).toBeInTheDocument()
      // Read-only even for an admin — no remove (x) controls in the sheet,
      // unlike the card's own always-editable inline breakdown below it.
      expect(within(sheet).queryByLabelText(/Remove/)).not.toBeInTheDocument()
      expect(within(sheet).queryByRole('button', { name: 'Add doctor' })).not.toBeInTheDocument()

      // The card's own inline breakdown is untouched — still showing (and
      // still editable) right where it always was.
      const card = aug8Button.closest('.card')
      expect(within(card).getByRole('button', { name: 'Anderson' })).toBeInTheDocument()
    })

    it('quick-glance sheet: shows open groups and gap count for an unplanned weekend', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      await user.click(await view.findByRole('button', { name: 'Sat 15 - Sun 16 Aug 2026' }))

      const heading = await screen.findByRole('heading', { name: 'Sat 15 - Sun 16 Aug 2026' })
      const sheet = heading.closest('.card')
      expect(within(sheet).getByText('4 gaps')).toBeInTheDocument()
      expect(within(sheet).getAllByText('Open')).toHaveLength(4)
    })

    it('quick-glance sheet: closes via the close button', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      await user.click(await view.findByRole('button', { name: 'Sat 8 - Sun 9 Aug 2026' }))
      await screen.findByRole('heading', { name: 'Sat 8 - Sun 9 Aug 2026' })

      await user.click(screen.getByLabelText('Close'))
      expect(screen.queryByRole('heading', { name: 'Sat 8 - Sun 9 Aug 2026' })).not.toBeInTheDocument()
    })
  })

  describe('desktop layout', () => {
    it('renders a sticky grid with a Weekend column, one column per category group, and a Status column', async () => {
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      expect(view.getByRole('columnheader', { name: 'Weekend' })).toBeInTheDocument()
      expect(view.getByRole('columnheader', { name: 'MO' })).toBeInTheDocument()
      expect(view.getByRole('columnheader', { name: 'Registrar' })).toBeInTheDocument()
      expect(view.getByRole('columnheader', { name: 'EC Intern' })).toBeInTheDocument()
      expect(view.getByRole('columnheader', { name: 'OT Intern' })).toBeInTheDocument()
      expect(view.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    })

    it('rows are not tinted by parity — each weekend instead carries a small "Wknd N · Odd/Even" badge', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      const table = within(view.getByRole('table'))
      // 2026-08-08 isn't the default-selected row (that's next weekend,
      // 2026-08-01), so its background reflects parity only — not the
      // selection highlight, which also uses bg-accent-tint.
      const aug8Row = table.getByText('Sat 8 - Sun 9 Aug 2026').closest('tr')
      expect(aug8Row.className).not.toMatch(/bg-accent-tint|bg-flagAmber-bg/)
      expect(within(aug8Row).getByText(`Wknd 2 · ${isEvenWeekend('2026-08-08') ? 'Even' : 'Odd'}`)).toBeInTheDocument()

      const aug15Row = table.getByText('Sat 15 - Sun 16 Aug 2026').closest('tr')
      expect(within(aug15Row).getByText(`Wknd 3 · ${isEvenWeekend('2026-08-15') ? 'Even' : 'Odd'}`)).toBeInTheDocument()
    })

    it('Status column shows Fully planned or a gap count per row, and open category cells show an Open chip', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      const table = within(view.getByRole('table'))
      const aug1Row = table.getByText('Sat 1 - Sun 2 Aug 2026').closest('tr')
      expect(within(aug1Row).getByText('3 gaps')).toBeInTheDocument()
      expect(within(aug1Row).getAllByText('Open')).toHaveLength(3)

      const aug8Row = table.getByText('Sat 8 - Sun 9 Aug 2026').closest('tr')
      expect(within(aug8Row).getByText('Fully planned')).toBeInTheDocument()
      expect(within(aug8Row).queryByText('Open')).not.toBeInTheDocument()
    })

    it('defaults the inspector to the next weekend, showing a read-only assignment summary', async () => {
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      const inspector = screen.getByTestId('weekend-inspector')
      expect(within(inspector).getByText('Sat 1 - Sun 2 Aug 2026')).toBeInTheDocument()
      expect(within(inspector).getByText('3 roles open')).toBeInTheDocument()
      expect(within(inspector).getByText('Anderson')).toBeInTheDocument() // MO filled
      expect(within(inspector).getAllByText('Open')).toHaveLength(3) // Registrar/COSMO/COSMOPsych open
      // View mode has no inline edit controls
      expect(within(inspector).queryByRole('button', { name: 'Add doctor' })).not.toBeInTheDocument()
    })

    it('clicking a grid row selects it and updates the inspector without navigating away', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug15Cell = await view.findByText('Sat 15 - Sun 16 Aug 2026')
      await user.click(aug15Cell.closest('tr'))

      const inspector = screen.getByTestId('weekend-inspector')
      expect(within(inspector).getByText('Sat 15 - Sun 16 Aug 2026')).toBeInTheDocument()
      expect(within(inspector).getByText('4 roles open')).toBeInTheDocument()
    })

    it('the surname search narrows grid rows to weekends that doctor is assigned to', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)
      await view.findByText('Sat 15 - Sun 16 Aug 2026')

      await user.type(screen.getAllByPlaceholderText('Search name…')[0], 'Anderson')

      const table = within(view.getByRole('table'))
      expect(table.getByText('Sat 1 - Sun 2 Aug 2026')).toBeInTheDocument()
      expect(table.getByText('Sat 8 - Sun 9 Aug 2026')).toBeInTheDocument()
      expect(table.queryByText('Sat 15 - Sun 16 Aug 2026')).not.toBeInTheDocument()
    })

    it('non-admin: no Edit assignments action, and a View requests link is offered instead', async () => {
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      const inspector = screen.getByTestId('weekend-inspector')
      expect(within(inspector).queryByRole('button', { name: /Edit assignments/ })).not.toBeInTheDocument()
      const link = within(inspector).getByRole('link', { name: /View requests/ })
      expect(link).toHaveAttribute('href', '/leave?tab=requests')
    })

    it('admin: Edit assignments reveals per-category +/x controls, which Done editing hides again', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      // admin-1 isn't rostered on anything, so "My weekends" (the default
      // filter) would hide every weekend — switch to "All weekends" first.
      await showAll(view, user)

      const inspector = screen.getByTestId('weekend-inspector')
      expect(within(inspector).queryByRole('button', { name: 'Add doctor' })).not.toBeInTheDocument()

      await user.click(within(inspector).getByRole('button', { name: /Edit assignments/ }))
      expect(within(inspector).getAllByRole('button', { name: 'Add doctor' }).length).toBeGreaterThan(0)

      await user.click(within(inspector).getByRole('button', { name: 'Done editing' }))
      expect(within(inspector).queryByRole('button', { name: 'Add doctor' })).not.toBeInTheDocument()
      expect(within(inspector).getByRole('button', { name: /Edit assignments/ })).toBeInTheDocument()
    })

    it('admin: in edit mode, Add doctor is a full-width standard (teal) button, not the old small dashed one', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: /Edit assignments/ }))

      const addButtons = within(inspector).getAllByRole('button', { name: 'Add doctor' })
      for (const button of addButtons) {
        expect(button).toHaveClass('btn-primary', 'w-full')
        expect(button.className).not.toContain('border-dashed')
      }
    })

    it('inspector: no "Selected weekend" label — the date is the panel\'s own heading', async () => {
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      const inspector = screen.getByTestId('weekend-inspector')
      expect(within(inspector).queryByText('Selected weekend')).not.toBeInTheDocument()
      expect(within(inspector).getByText('Sat 1 - Sun 2 Aug 2026')).toBeInTheDocument()
    })

    it('inspector: the Wknd parity badge sits beneath the date, not beside it', async () => {
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      const inspector = screen.getByTestId('weekend-inspector')
      const heading = within(inspector).getByText('Sat 1 - Sun 2 Aug 2026')
      const badge = within(inspector).getByText(/Wknd 1 · Even/)
      // Siblings within the same header block, badge second — not a
      // separate flex item positioned to the date's side.
      expect(badge.parentElement).toBe(heading.parentElement)
      expect(Array.from(heading.parentElement.children).indexOf(badge)).toBeGreaterThan(
        Array.from(heading.parentElement.children).indexOf(heading)
      )
    })

    it('inspector: assigned names right-align even when they wrap onto a second line', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      const aug8Cell = await view.findByText('Sat 8 - Sun 9 Aug 2026')
      const user = userEvent.setup()
      await user.click(aug8Cell.closest('tr'))

      const inspector = screen.getByTestId('weekend-inspector')
      const names = within(inspector).getByText('Anderson', { exact: false })
      expect(names).toHaveClass('text-right')
    })

    it('admin: can add a doctor to an open slot via the inspector, and the grid row reflects it', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug15Cell = await view.findByText('Sat 15 - Sun 16 Aug 2026')
      await user.click(aug15Cell.closest('tr'))

      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: /Edit assignments/ }))
      const addButtons = within(inspector).getAllByRole('button', { name: 'Add doctor' })
      await user.click(addButtons[0]) // MO row is first

      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      expect(within(sheet).getByRole('combobox', { name: 'Category' })).toHaveValue('MO')
      await user.click(within(sheet).getByRole('checkbox', { name: /Alice Anderson/ }))
      await user.click(within(sheet).getByRole('button', { name: /Add 1 doctor/ }))

      expect(await within(inspector).findByText('Anderson')).toBeInTheDocument()
      const aug15Row = within(view.getByRole('table')).getByText('Sat 15 - Sun 16 Aug 2026').closest('tr')
      expect(within(aug15Row).getByText('Anderson')).toBeInTheDocument()
    })

    it('admin: can select several doctors at once via the inspector, same as mobile', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug15Cell = await view.findByText('Sat 15 - Sun 16 Aug 2026')
      await user.click(aug15Cell.closest('tr'))

      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: /Edit assignments/ }))
      const addButtons = within(inspector).getAllByRole('button', { name: 'Add doctor' })
      await user.click(addButtons[1]) // Registrar row

      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      await user.click(within(sheet).getByRole('checkbox', { name: /Bob Botha/ }))
      await user.click(within(sheet).getByRole('checkbox', { name: /Erin Eaton/ }))
      await user.click(within(sheet).getByRole('button', { name: /Add 2 doctors/ }))

      expect(await within(inspector).findByText('Botha')).toBeInTheDocument()
      expect(within(inspector).getByText('Eaton')).toBeInTheDocument()
    })

    it('admin: a filled category shows a compact + trigger instead of the full-width button, opening the sheet scoped to it', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      // Aug 8 has all 4 categories filled in ENTRIES.
      const aug8Cell = await view.findByText('Sat 8 - Sun 9 Aug 2026')
      await user.click(aug8Cell.closest('tr'))

      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: /Edit assignments/ }))
      expect(within(inspector).queryByRole('button', { name: 'Add doctor' })).not.toBeInTheDocument()

      await user.click(within(inspector).getByRole('button', { name: 'Add another doctor to MO' }))
      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      expect(within(sheet).getByRole('combobox', { name: 'Category' })).toHaveValue('MO')
    })

    it('admin: can remove an assigned doctor via the inspector', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      // admin-1 isn't rostered on anything, so "My weekends" (the default
      // filter) would hide every weekend — switch to "All weekends" first.
      await showAll(view, user)

      // Inspector defaults to next weekend (2026-08-01), which has Anderson on MO.
      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: /Edit assignments/ }))
      const removeButton = await within(inspector).findByRole('button', { name: 'Remove Anderson from 2026-08-01' })
      await user.click(removeButton)

      expect(within(inspector).queryByRole('button', { name: 'Remove Anderson from 2026-08-01' })).not.toBeInTheDocument()
    })

    it('desktop: Review log lives inside the More Actions kebab too, same as mobile', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'More Actions' }))
      const menu = await screen.findByRole('dialog', { name: 'More actions' })
      expect(within(menu).getByRole('button', { name: 'Review log' })).toBeInTheDocument()
    })

    it('desktop: search and Filter share one row without wrapping, and Filter renders icon-only', async () => {
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      const filterButton = view.getByRole('button', { name: 'Filter' })
      const label = within(filterButton).getByText('Filter')
      expect(label.className).toBe('hidden')

      const row = filterButton.closest('div.md\\:flex')
      expect(row.className).toContain('flex-nowrap')
    })

    it('desktop: search+filter share one row with the month nav/More Actions/Legend cluster, and the search field is width-capped rather than stretching full width', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      // Regression: search+filter used to render as their own row above the
      // nav row, with nothing tying them together — the search field, alone
      // in its row, stretched across nearly the full table width. Now
      // they're one flex row (justify-between), so the month-nav button and
      // the search input should share the same immediate row ancestor.
      // The Filter trigger's own `.md\\:flex` row (the desktop, not mobile,
      // half of Toolbar) is where the desktop-facing search input lives —
      // scoped this way since the placeholder text alone would otherwise
      // also match Toolbar's own internal mobile-half input.
      const monthButton = view.getByRole('button', { name: 'August 2026' })
      const desktopFilterButton = view.getByRole('button', { name: 'Filter' })
      const searchInput = desktopFilterButton.closest('div.md\\:flex').querySelector('input[placeholder="Search name…"]')
      const moreActionsButton = view.getByRole('button', { name: 'More Actions' })

      const row = monthButton.closest('div.justify-between')
      expect(row).not.toBeNull()
      expect(row.contains(searchInput)).toBe(true)
      expect(row.contains(moreActionsButton)).toBe(true)

      // Capped rather than free to fill the whole row (max-w-xs, from
      // Toolbar's own compact desktop styling).
      expect(searchInput.closest('div.max-w-xs')).not.toBeNull()
    })

    it('desktop: the Legend trigger next to More Actions opens a sheet with "How it works" as its footer', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'Legend and how it works' }))
      const sheet = await screen.findByRole('dialog', { name: 'Legend' })
      expect(within(sheet).getByText('How it works')).toBeInTheDocument()
    })
  })

  // Session clock is 2026-08-01 (a Saturday, see the top-of-file beforeEach)
  // — August's own 5 Saturdays (01/08/15/22/29) don't line up 1:1 with
  // September's 4 (05/12/19/26), so position-based paste mapping puts
  // August's 1st weekend (Aug 1, just Anderson/MO) onto September's 1st
  // (Sept 5), and August's 2nd weekend (Aug 8, all 4 groups) onto Sept 12
  // — the assertions below account for that split rather than assuming a
  // 1:1 weekend-count match.
  describe('Copy/Paste/Clear (admin-only)', () => {
    it('admin: Copy month builds a clipboard pill with a Paste action for the currently viewed month', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      await screen.findByRole('button', { name: 'More Actions' })

      await clickMoreAction(user, 'Copy August')

      expect(screen.getByText('📋 August 2026 copied')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Paste into August 2026' })).toBeInTheDocument()
    })

    it('non-admin: no Copy/Clear month controls and no clipboard pill', async () => {
      renderView()
      await screen.findAllByText('August 2026')

      expect(screen.queryByRole('button', { name: /^Copy /})).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Clear /})).not.toBeInTheDocument()
      expect(screen.queryByText(/copied$/)).not.toBeInTheDocument()
    })

    it('admin: pastes the copied month into a different month (fill-empty, default), keeping the clipboard for a further paste', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await clickMoreAction(user, 'Copy August')
      await user.click(view.getByRole('button', { name: 'Next month' }))
      await view.findByText('September 2026')

      await user.click(screen.getByRole('button', { name: 'Paste into September 2026' }))
      await screen.findByRole('heading', { name: 'Paste August 2026 into September 2026' })
      expect(screen.getByText(/Will add/).textContent).toContain('Will add 5 assignments across 4 weekends.')

      await user.click(screen.getByRole('button', { name: 'Confirm paste' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Paste August 2026 into September 2026' })).not.toBeInTheDocument())

      // Clipboard stays populated — the same copied month can be pasted again elsewhere.
      expect(screen.getByText('📋 August 2026 copied')).toBeInTheDocument()

      // en-GB's short month name for September is "Sept" (4 letters), not "Sep".
      // August has 5 Saturdays (1,8,15,22,29), September has 4 (5,12,19,26)
      // — paste now matches by real calendar parity, not weekend index, so
      // August 1's group (parity shared with Aug 15/29) lands on Sept 12
      // (the same parity), while August 8's group (shared with Aug 22)
      // lands on Sept 5 — see planWeekendPaste's own comment for why.
      const sep5Row = within(view.getByRole('table')).getByText('Sat 5 - Sun 6 Sept 2026').closest('tr')
      expect(within(sep5Row).getByText('Anderson')).toBeInTheDocument()
      expect(within(sep5Row).getByText('Botha')).toBeInTheDocument()
      expect(within(sep5Row).getByText('Cosmo')).toBeInTheDocument()
      expect(within(sep5Row).getByText('Della')).toBeInTheDocument()

      const sep12Row = within(view.getByRole('table')).getByText('Sat 12 - Sun 13 Sept 2026').closest('tr')
      expect(within(sep12Row).getByText('Anderson')).toBeInTheDocument()
    })

    it('admin: paste modal counts an already-assigned skip under fill-empty, and switches to a delete-first note under Overwrite', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      // p1 is already on 2026-09-05 (Registrar). Parity-based matching (see
      // planWeekendPaste) lands August 8's whole 4-entry block on Sept 5:
      // its own MO/p1 entry collides with the pre-existing Registrar/p1
      // (same profile, counted as "already assigned"), and its Registrar
      // entry is silently skipped too (that group is already filled on
      // Sept 5 — the normal, uncounted fill-empty behaviour) — leaving
      // just COSMO and COSMOPsych to insert on Sept 5. August 1's single
      // MO/p1 entry lands cleanly on Sept 12 (nothing pre-existing there).
      mockResponses['weekend_planner_entries:select'] = {
        data: [...ENTRIES, { id: 'e6', weekend_saturday: '2026-09-05', profile_id: 'p1', category: 'Registrar' }],
        error: null,
      }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await clickMoreAction(user, 'Copy August')
      await user.click(view.getByRole('button', { name: 'Next month' }))
      await view.findByText('September 2026')
      await user.click(screen.getByRole('button', { name: 'Paste into September 2026' }))
      await screen.findByRole('heading', { name: 'Paste August 2026 into September 2026' })

      const summary = screen.getByText(/Will add/).textContent
      expect(summary).toContain('Will add 3 assignments across 4 weekends.')
      expect(summary).toContain('1 skipped (already assigned elsewhere that weekend).')

      await user.click(screen.getByRole('button', { name: 'Overwrite instead' }))
      const overwriteSummary = screen.getByText(/Will add/).textContent
      expect(overwriteSummary).toContain('Will add 5 assignments across 4 weekends.')
      expect(overwriteSummary).toContain('1 existing assignment will be removed first.')
    })

    it('admin: Clear month deletes every entry in the viewed month, after confirmation', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await clickMoreAction(user, 'Clear August')
      const heading = await screen.findByRole('heading', { name: 'Clear August 2026?' })
      // ENTRIES has 5 assignments in August: 1 at Aug 1, 4 at Aug 8.
      expect(heading.closest('.card')).toHaveTextContent('This removes 5 assignments.')

      await user.click(screen.getByRole('button', { name: 'Clear' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Clear August 2026?' })).not.toBeInTheDocument())

      const aug8Row = within(view.getByRole('table')).getByText('Sat 8 - Sun 9 Aug 2026').closest('tr')
      expect(within(aug8Row).getByText('4 gaps')).toBeInTheDocument()
      expect(within(aug8Row).getAllByText('Open')).toHaveLength(4)
    })

    it('admin: Clear weekend removes just that weekend\'s entries via the desktop inspector', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      // Inspector defaults to next weekend (2026-08-01, this session's
      // "today") — select the fully-covered Aug 8 weekend explicitly instead.
      const aug8Cell = await view.findByText('Sat 8 - Sun 9 Aug 2026')
      await user.click(aug8Cell.closest('tr'))

      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: 'Clear weekend' }))

      const heading = await screen.findByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })
      expect(heading.closest('.card')).toHaveTextContent('This removes 4 assignments.')
      await user.click(screen.getByRole('button', { name: 'Clear' }))

      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })).not.toBeInTheDocument())
      expect(within(inspector).getByText('4 roles open')).toBeInTheDocument()
    })

    it('admin: Clear weekend removes just that weekend\'s entries via the mobile card\'s ⋮ menu', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      const aug8Card = (await view.findByRole('button', { name: 'Sat 8 - Sun 9 Aug 2026' })).closest('.card')
      await user.click(within(aug8Card).getByRole('button', { name: 'More actions for weekend 2026-08-08' }))
      const menu = await screen.findByRole('dialog', { name: 'Sat 8 - Sun 9 Aug 2026' })
      await user.click(within(menu).getByRole('button', { name: 'Clear weekend' }))

      await screen.findByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })
      await user.click(screen.getByRole('button', { name: 'Clear' }))

      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })).not.toBeInTheDocument())
      expect(within(aug8Card).getAllByRole('button', { name: 'Open' })).toHaveLength(4)
    })

    it('admin: per-card ⋮ menu — Copy weekend then Paste here on another card, with the source card highlighted', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      const aug8Card = (await view.findByRole('button', { name: 'Sat 8 - Sun 9 Aug 2026' })).closest('.card')
      await user.click(within(aug8Card).getByRole('button', { name: 'More actions for weekend 2026-08-08' }))
      const aug8Menu = await screen.findByRole('dialog', { name: 'Sat 8 - Sun 9 Aug 2026' })
      await user.click(within(aug8Menu).getByRole('button', { name: 'Copy weekend' }))

      expect(await screen.findByText(/Sat 8 - Sun 9 Aug 2026 copied/)).toBeInTheDocument()
      expect(aug8Card.className).toMatch(/ring-2 ring-accent/)

      const aug15Card = (await view.findByRole('button', { name: 'Sat 15 - Sun 16 Aug 2026' })).closest('.card')
      await user.click(within(aug15Card).getByRole('button', { name: 'More actions for weekend 2026-08-15' }))
      const aug15Menu = await screen.findByRole('dialog', { name: 'Sat 15 - Sun 16 Aug 2026' })
      await user.click(within(aug15Menu).getByRole('button', { name: 'Paste here' }))

      await screen.findByRole('heading', { name: /Paste Sat 8 - Sun 9 Aug 2026 into/ })
      await user.click(screen.getByRole('button', { name: 'Confirm paste' }))

      expect(await within(aug15Card).findByText('Anderson')).toBeInTheDocument()
    })

    it('non-admin: no Clear weekend action on the mobile card or desktop inspector', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug8Card = (await view.findByRole('button', { name: 'Sat 8 - Sun 9 Aug 2026' })).closest('.card')
      expect(within(aug8Card).queryByRole('button', { name: /Clear weekend/ })).not.toBeInTheDocument()

      const inspector = screen.getByTestId('weekend-inspector')
      expect(within(inspector).queryByRole('button', { name: 'Clear weekend' })).not.toBeInTheDocument()
    })

    it('admin: Copy weekend + Paste weekend targets the specific weekend selected, not the whole month', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      // Inspector defaults to next weekend (2026-08-01) — select the
      // fully-covered Aug 8 weekend explicitly as the copy source.
      const aug8Cell = await view.findByText('Sat 8 - Sun 9 Aug 2026')
      await user.click(aug8Cell.closest('tr'))

      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: 'Copy weekend' }))

      const aug15Cell = await view.findByText('Sat 15 - Sun 16 Aug 2026')
      await user.click(aug15Cell.closest('tr'))

      await user.click(within(inspector).getByRole('button', { name: 'Paste weekend' }))
      await screen.findByRole('heading', { name: 'Paste Sat 8 - Sun 9 Aug 2026 into Sat 15 - Sun 16 Aug 2026' })
      expect(screen.getByText(/Will add/).textContent).toContain('Will add 4 assignments across 1 weekend.')

      await user.click(screen.getByRole('button', { name: 'Confirm paste' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: /Paste Sat 8/ })).not.toBeInTheDocument())

      const aug15Row = within(view.getByRole('table')).getByText('Sat 15 - Sun 16 Aug 2026').closest('tr')
      expect(within(aug15Row).getByText('Anderson')).toBeInTheDocument()
      expect(within(aug15Row).getByText('Botha')).toBeInTheDocument()
    })

    it('admin: Copy quarter builds a clipboard pill labelled with the quarter (current month + next 2)', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      await screen.findByRole('button', { name: 'More Actions' })

      await clickMoreAction(user, 'Copy quarter')

      expect(screen.getByText('📋 Aug-Oct 2026 copied')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Paste into Aug-Oct 2026' })).toBeInTheDocument()
    })

    it('admin: Clear quarter opens a confirmation stating the total entries across all 3 months', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      await screen.findByRole('button', { name: 'More Actions' })

      await clickMoreAction(user, 'Clear quarter')

      // ENTRIES only has assignments in August within Aug/Sep/Oct: 1 at Aug 1, 4 at Aug 8.
      const heading = await screen.findByRole('heading', { name: 'Clear Aug-Oct 2026?' })
      expect(heading.closest('.card')).toHaveTextContent('This removes 5 assignments.')
    })

    it('admin: Clear month shows an Undo toast; clicking Undo calls restoreWeekendPlannerBatch and dismisses the toast', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await clickMoreAction(user, 'Clear August')
      await screen.findByRole('heading', { name: 'Clear August 2026?' })
      await user.click(screen.getByRole('button', { name: 'Clear' }))

      expect(await screen.findByText('Cleared August 2026')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Undo' }))

      expect(restoreWeekendPlannerBatch).toHaveBeenCalledWith(expect.objectContaining({ changedBy: 'admin-1' }))
      await waitFor(() => expect(screen.queryByText('Cleared August 2026')).not.toBeInTheDocument())
    })

    it('admin: every paste — fill-empty or overwrite — shows the Undo toast', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await clickMoreAction(user, 'Copy August')
      await user.click(view.getByRole('button', { name: 'Next month' }))
      await view.findByText('September 2026')

      // First paste: fill-empty (default) — nothing to overwrite, but every
      // edit gets a toast now, not just destructive ones (Part 8).
      await user.click(screen.getByRole('button', { name: 'Paste into September 2026' }))
      await screen.findByRole('heading', { name: 'Paste August 2026 into September 2026' })
      await user.click(screen.getByRole('button', { name: 'Confirm paste' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Paste August 2026 into September 2026' })).not.toBeInTheDocument())
      expect(await screen.findByText('Pasted into September 2026')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Dismiss' }))

      // Second paste: overwrite — September now has entries from the first
      // paste, so this one actually deletes something first.
      await user.click(screen.getByRole('button', { name: 'Paste into September 2026' }))
      await screen.findByRole('heading', { name: 'Paste August 2026 into September 2026' })
      await user.click(screen.getByRole('button', { name: 'Overwrite instead' }))
      await user.click(screen.getByRole('button', { name: 'Confirm paste' }))

      expect(await screen.findByText('Pasted into September 2026 (overwrite)')).toBeInTheDocument()
    })

    it('the pending Undo toast clears when the signed-in profile changes — one admin can never revert another admin\'s action', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      const rendered = render(<Harness />, { wrapper: MemoryRouter })
      const view = await desktop()
      await view.findByText('August 2026')

      await clickMoreAction(user, 'Clear August')
      await screen.findByRole('heading', { name: 'Clear August 2026?' })
      await user.click(screen.getByRole('button', { name: 'Clear' }))
      await screen.findByText('Cleared August 2026')

      // A second admin signs in, in the same tab, without a page reload —
      // e.g. Paul logs out and George logs in without a full app remount.
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-2' } }
      rendered.rerender(<Harness />)

      expect(screen.queryByText('Cleared August 2026')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    })

    it('admin: "Plan next open weekend" jumps to the nearest weekend with any open role and opens its picker', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      // 2026-08-01 is the earliest open weekend in ENTRIES (only MO filled).
      const heading = await view.findByText('Next weekend needing staff')
      const panel = heading.closest('.card')
      expect(within(panel).getByText('Sat 1 - Sun 2 Aug 2026')).toBeInTheDocument()
      await user.click(within(panel).getByRole('button', { name: 'Plan now' }))

      // Opens the picker for the first open group (Registrar) on that weekend.
      const sheet = (await screen.findByRole('heading', { name: /Add doctor —/ })).closest('.card')
      expect(within(sheet).getByRole('combobox', { name: 'Category' })).toHaveValue('Registrar')
    })

    it('admin: "Plan next open weekend" retargets to the next weekend still open once this one is fully filled', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      const aug1Card = list(view).getByText('Sat 1 - Sun 2 Aug 2026').closest('.card')

      async function fillNextOpenRole(doctorNamePattern) {
        const heading = await view.findByText('Next weekend needing staff')
        const panel = heading.closest('.card')
        await user.click(within(panel).getByRole('button', { name: 'Plan now' }))
        await user.click(await screen.findByRole('checkbox', { name: doctorNamePattern }))
        await user.click(screen.getByRole('button', { name: /Add 1 doctor/ }))
      }

      // Aug 1 starts with only MO filled — fill Registrar, EC Intern in turn
      // (the panel's own "needs-planning" filter keeps Aug 1's card visible
      // as long as it still has an open role to check the fill against).
      await fillNextOpenRole(/Bob Botha/)
      await within(aug1Card).findByText('Botha')
      await fillNextOpenRole(/Carol Cosmo/)
      await within(aug1Card).findByText('Cosmo')

      // Filling the last role (OT Intern) completes Aug 1 — under the
      // "needs-planning" filter the card disappears from the list in the
      // same render as the fill, so there's no visible in-between state to
      // assert on the card itself; what matters is where the panel points
      // next.
      await fillNextOpenRole(/Dan Della/)

      // Aug 1 is now fully planned and Aug 8 is already fully covered in
      // ENTRIES — the panel should have moved on to Aug 15.
      const finalHeading = await view.findByText('Next weekend needing staff')
      expect(within(finalHeading.closest('.card')).getByText('Sat 15 - Sun 16 Aug 2026')).toBeInTheDocument()
    })
  })
})
