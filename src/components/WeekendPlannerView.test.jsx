import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import WeekendPlannerView from './WeekendPlannerView'
import { isEvenWeekend } from '../lib/weekendPlanner'

// Sandbox clock is 2026-08-01 (a Saturday) throughout this session.
let mockAuth = { isAdmin: false, canSubmitLeave: true, profile: { id: 'p1' } }
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

function renderView() {
  return render(<WeekendPlannerView />, { wrapper: MemoryRouter })
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

async function showAll(view, user) {
  await user.click(view.getByRole('button', { name: 'All weekends' }))
}

describe('WeekendPlannerView', () => {
  beforeEach(() => {
    insertedRows.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PROFILES, error: null }
    mockResponses['weekend_planner_entries:select'] = { data: ENTRIES, error: null }
    mockResponses['weekend_planner_entries:delete'] = { data: null, error: null }
    mockResponses['leave_requests:select'] = { data: MY_WEEKEND_REQUESTS, error: null }
    mockAuth = { isAdmin: false, canSubmitLeave: true, profile: { id: 'p1' } }
  })

  describe('mobile layout', () => {
    it('shows the Next weekend summary card with coverage and "on rotation" status', async () => {
      renderView()
      const view = await mobile()
      const heading = await view.findByText('Next weekend')
      const card = heading.closest('.card')
      expect(within(card).getByText('Sat 1 - Sun 2 Aug 2026')).toBeInTheDocument()
      expect(within(card).getByText(/1 of 4 groups planned/)).toBeInTheDocument()
      expect(within(card).getByText(/Registrar, EC COSMO \/ Intern, OT COSMO \/ Intern still open/)).toBeInTheDocument()
      expect(within(card).getByText(/You.re on rotation this weekend/)).toBeInTheDocument()
    })

    it('defaults to the "My weekends" filter, leftmost of the chips', async () => {
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      const chips = view.getAllByRole('button', { name: /^(My weekends|My requests|All weekends|Needs planning)$/ })
      expect(chips.map(c => c.textContent)).toEqual(['My weekends', 'My requests', 'All weekends'])
      expect(view.getByRole('button', { name: 'My weekends' })).toHaveClass('bg-accent')

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
      expect(within(aug8Card).queryByText('Needs planning')).not.toBeInTheDocument() // fully covered

      const aug15Heading = view.getByText('Sat 15 - Sun 16 Aug 2026')
      const aug15Card = aug15Heading.closest('.card')
      expect(within(aug15Card).getByText('Needs planning')).toBeInTheDocument()
    })

    it('cards alternate teal/amber background+text colour by weekend, independent of coverage', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      // 2026-08-01 is both the next-weekend card and this month's first list card
      const aug1Card = view.getAllByText('Sat 1 - Sun 2 Aug 2026')[1].closest('.card')
      const aug8Card = view.getByText('Sat 8 - Sun 9 Aug 2026').closest('.card')
      const aug1IsAccent = aug1Card.className.includes('bg-accent-tint')
      const aug8IsAccent = aug8Card.className.includes('bg-accent-tint')
      expect(aug1IsAccent).not.toBe(aug8IsAccent)
      expect(aug1Card.className.includes('bg-flagAmber-bg') || aug1IsAccent).toBe(true)
      expect(aug8Card.className.includes('bg-flagAmber-bg') || aug8IsAccent).toBe(true)
    })

    it('"Needs planning" no longer overrides the background — a rose pillbox and rose open-slot counts instead', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug15Card = view.getByText('Sat 15 - Sun 16 Aug 2026').closest('.card')
      // still themed by parity, not overridden to a flat amber "warning" card
      expect(aug15Card.className.includes('bg-accent-tint') || aug15Card.className.includes('bg-flagAmber-bg')).toBe(true)
      expect(within(aug15Card).getByText('Needs planning')).toHaveClass('bg-rose-light', 'text-rose-dark')
      for (const el of within(aug15Card).getAllByText('1 open')) {
        expect(el).toHaveClass('text-rose-dark')
      }
    })

    it("filled surnames and the admin's +/x controls use the weekend's parity text colour", async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug8Card = view.getByText('Sat 8 - Sun 9 Aug 2026').closest('.card')
      const scheme = aug8Card.className.includes('bg-accent-tint') ? 'text-accent' : 'text-flagAmber'
      expect(within(aug8Card).getByText('Anderson').closest('span')).toHaveClass(scheme)
      expect(within(aug8Card).getByRole('button', { name: 'Remove Anderson from 2026-08-08' })).toHaveClass(scheme)

      const aug15Card = view.getByText('Sat 15 - Sun 16 Aug 2026').closest('.card')
      const aug15Scheme = aug15Card.className.includes('bg-accent-tint') ? 'text-accent' : 'text-flagAmber'
      const addButtons = within(aug15Card).getAllByRole('button', { name: 'Add doctor' })
      expect(addButtons[0]).toHaveClass(aug15Scheme)
    })

    it('"Needs planning" filter (admin-only) hides fully-covered weekends', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'Needs planning' }))
      expect(view.queryByText('Sat 8 - Sun 9 Aug 2026')).not.toBeInTheDocument()
      expect(view.getByText('Sat 15 - Sun 16 Aug 2026')).toBeInTheDocument()
    })

    it('admin: "All weekends" leads the filter chips, ahead of "My weekends"', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      const chips = view.getAllByRole('button', { name: /^(My weekends|My requests|All weekends|Needs planning)$/ })
      expect(chips.map(c => c.textContent)).toEqual(['All weekends', 'My weekends', 'My requests', 'Needs planning'])
    })

    it('admin: lands on "All weekends" by default; non-admin still lands on "My weekends"', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      expect(view.getByRole('button', { name: 'All weekends' })).toHaveClass('bg-accent')
      expect(view.getByRole('button', { name: 'My weekends' })).not.toHaveClass('bg-accent')
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
      await user.click(view.getByRole('button', { name: 'My weekends' }))

      expect(view.getByText('Sat 8 - Sun 9 Aug 2026')).toBeInTheDocument() // p1 assigned
      expect(view.queryByText('Sat 15 - Sun 16 Aug 2026')).not.toBeInTheDocument() // nobody assigned
    })

    it('"My requests" filter shows weekends with the doctor\'s own weekend-exception request, with a status badge', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      await user.click(view.getByRole('button', { name: 'My requests' }))
      const aug22Heading = await view.findByText('Sat 22 - Sun 23 Aug 2026')
      expect(view.queryByText('Sat 8 - Sun 9 Aug 2026')).not.toBeInTheDocument() // in My weekends, not My requests
      expect(within(aug22Heading.closest('.card')).getByText('Exception pending')).toBeInTheDocument()
    })

    it('month navigation moves forward and the Previous button is disabled on the starting (current) month', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)

      expect(view.getByRole('button', { name: 'Previous month' })).toBeDisabled()
      await user.click(view.getByRole('button', { name: 'Next month' }))

      expect(await view.findByText('September 2026')).toBeInTheDocument()
      expect(view.getByText('Sat 5 - Sun 6 Sep 2026')).toBeInTheDocument()
      expect(view.queryByText('Sat 8 - Sun 9 Aug 2026')).not.toBeInTheDocument()
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

    it('admin: can remove an assigned doctor from a weekend', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      await view.findByRole('button', { name: 'Remove Anderson from 2026-08-01' })

      await user.click(view.getByRole('button', { name: 'Remove Anderson from 2026-08-01' }))
      expect(view.queryByRole('button', { name: 'Remove Anderson from 2026-08-01' })).not.toBeInTheDocument()
    })

    it('admin: can add a doctor to an open slot via the picker', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')
      await showAll(view, user)
      const aug15Heading = await view.findByText('Sat 15 - Sun 16 Aug 2026')
      const aug15Card = aug15Heading.closest('.card')

      const addButtons = within(aug15Card).getAllByRole('button', { name: 'Add doctor' })
      await user.click(addButtons[0]) // MO row is first
      await user.selectOptions(within(aug15Card).getByRole('combobox'), 'p1')

      expect(await within(aug15Card).findByText('Anderson')).toBeInTheDocument()
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
      expect(within(card).getByText('Anderson')).toBeInTheDocument()
      expect(within(card).getByRole('button', { name: 'Remove Anderson from 2026-08-08' })).toBeInTheDocument()
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
      expect(within(inspector).getByText('3 gaps')).toBeInTheDocument()
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
      expect(within(inspector).getByText('4 gaps')).toBeInTheDocument()
    })

    it('the surname search narrows grid rows to weekends that doctor is assigned to', async () => {
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)
      await view.findByText('Sat 15 - Sun 16 Aug 2026')

      await user.type(view.getByLabelText('Search by surname'), 'Anderson')

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
      expect(link).toHaveAttribute('href', '/leave?tab=planners&sub=requests')
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

    it('admin: can add a doctor to an open slot via the inspector, and the grid row reflects it', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')
      await showAll(view, user)

      const aug15Cell = await view.findByText('Sat 15 - Sun 16 Aug 2026')
      await user.click(aug15Cell.closest('tr'))

      // jsdom loads no stylesheet, so `lg:hidden` never actually removes
      // the mobile section from the render/focus tree the way a real
      // desktop viewport's CSS would. Once this test selects a weekend the
      // mobile card list is also showing, both copies of the picker would
      // mount with `autoFocus`, and whichever mounts second steals focus
      // and blurs the other closed before this test can interact with it.
      // A real browser never hits this (display:none elements can't be
      // focused) — removing the node here reproduces that, not a real bug.
      screen.getByTestId('weekend-mobile').remove()

      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: /Edit assignments/ }))
      const addButtons = within(inspector).getAllByRole('button', { name: 'Add doctor' })
      await user.click(addButtons[0]) // MO row is first
      await user.selectOptions(await within(inspector).findByRole('combobox'), 'p1')

      expect(await within(inspector).findByText('Anderson')).toBeInTheDocument()
      const aug15Row = within(view.getByRole('table')).getByText('Sat 15 - Sun 16 Aug 2026').closest('tr')
      expect(within(aug15Row).getByText('Anderson')).toBeInTheDocument()
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
  })

  // Session clock is 2026-08-06 (a Thursday), so the fetch's rolling window
  // starts from the next Saturday on/after it — 2026-08-01 (with e1) falls
  // outside that window and is excluded from monthSaturdays/monthEntryCount
  // throughout this block; only 2026-08-08/15/22/29 (4 weekends) are in
  // view for August, same as September's 4 (05/12/19/26), so position-based
  // paste mapping lines up 1:1 without needing to account for a mismatched
  // weekend count.
  describe('Copy/Paste/Clear (admin-only)', () => {
    it('admin: Copy month builds a clipboard pill with a Paste action for the currently viewed month', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      await screen.findByRole('button', { name: 'Copy August' })

      await user.click(screen.getByRole('button', { name: 'Copy August' }))

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

      await user.click(screen.getByRole('button', { name: 'Copy August' }))
      await user.click(view.getByRole('button', { name: 'Next month' }))
      await view.findByText('September 2026')

      await user.click(screen.getByRole('button', { name: 'Paste into September 2026' }))
      await screen.findByRole('heading', { name: 'Paste August 2026 into September 2026' })
      expect(screen.getByText(/Will add/).textContent).toContain('Will add 4 assignments across 4 weekends.')

      await user.click(screen.getByRole('button', { name: 'Confirm paste' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Paste August 2026 into September 2026' })).not.toBeInTheDocument())

      // Clipboard stays populated — the same copied month can be pasted again elsewhere.
      expect(screen.getByText('📋 August 2026 copied')).toBeInTheDocument()

      // en-GB's short month name for September is "Sept" (4 letters), not "Sep".
      const sep5Row = within(view.getByRole('table')).getByText('Sat 5 - Sun 6 Sept 2026').closest('tr')
      expect(within(sep5Row).getByText('Anderson')).toBeInTheDocument()
      expect(within(sep5Row).getByText('Botha')).toBeInTheDocument()
      expect(within(sep5Row).getByText('Cosmo')).toBeInTheDocument()
      expect(within(sep5Row).getByText('Della')).toBeInTheDocument()
    })

    it('admin: paste modal counts an already-assigned skip under fill-empty, and switches to a delete-first note under Overwrite', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      // p1 is already on 2026-09-05 (Registrar) — their copied MO entry from
      // August 8 collides (already assigned to that weekend), and Registrar
      // is already filled there too (silent group-filled skip, not counted).
      mockResponses['weekend_planner_entries:select'] = {
        data: [...ENTRIES, { id: 'e6', weekend_saturday: '2026-09-05', profile_id: 'p1', category: 'Registrar' }],
        error: null,
      }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await user.click(screen.getByRole('button', { name: 'Copy August' }))
      await user.click(view.getByRole('button', { name: 'Next month' }))
      await view.findByText('September 2026')
      await user.click(screen.getByRole('button', { name: 'Paste into September 2026' }))
      await screen.findByRole('heading', { name: 'Paste August 2026 into September 2026' })

      const summary = screen.getByText(/Will add/).textContent
      expect(summary).toContain('Will add 2 assignments across 4 weekends.')
      expect(summary).toContain('1 skipped (already assigned elsewhere that weekend).')

      await user.click(screen.getByRole('button', { name: 'Overwrite instead' }))
      const overwriteSummary = screen.getByText(/Will add/).textContent
      expect(overwriteSummary).toContain('Will add 4 assignments across 4 weekends.')
      expect(overwriteSummary).toContain('1 existing assignment will be removed first.')
    })

    it('admin: Clear month deletes every entry in the viewed month, after confirmation', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await desktop()
      await view.findByText('August 2026')

      await user.click(screen.getByRole('button', { name: 'Clear August' }))
      const heading = await screen.findByRole('heading', { name: 'Clear August 2026?' })
      expect(heading.closest('.card')).toHaveTextContent('This removes 4 assignments.')

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

      // Inspector defaults to next weekend (2026-08-08, this session's
      // "today"), fully covered in ENTRIES.
      const inspector = screen.getByTestId('weekend-inspector')
      await user.click(within(inspector).getByRole('button', { name: 'Clear weekend' }))

      const heading = await screen.findByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })
      expect(heading.closest('.card')).toHaveTextContent('This removes 4 assignments.')
      await user.click(screen.getByRole('button', { name: 'Clear' }))

      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })).not.toBeInTheDocument())
      expect(within(inspector).getByText('4 gaps')).toBeInTheDocument()
    })

    it('admin: Clear weekend removes just that weekend\'s entries via the mobile card\'s trash icon', async () => {
      mockAuth = { isAdmin: true, canSubmitLeave: false, profile: { id: 'admin-1' } }
      const user = userEvent.setup()
      renderView()
      const view = await mobile()
      await view.findByText('August 2026')

      const aug8Card = (await view.findByRole('button', { name: 'Sat 8 - Sun 9 Aug 2026' })).closest('.card')
      await user.click(within(aug8Card).getByRole('button', { name: 'Clear weekend 2026-08-08' }))

      await screen.findByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })
      await user.click(screen.getByRole('button', { name: 'Clear' }))

      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Clear Sat 8 - Sun 9 Aug 2026?' })).not.toBeInTheDocument())
      expect(within(aug8Card).getAllByText('1 open')).toHaveLength(4)
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
  })
})
