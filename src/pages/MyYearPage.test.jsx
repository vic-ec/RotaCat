import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import MyYearPage from './MyYearPage'
import { formatWeekdayDate, todayStr } from '../lib/dateRange'

const ME = '11111111-1111-4111-8111-111111111111'
const ADA = '22222222-2222-4222-8222-222222222222'

let mockAuth
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

const { mockTables, eqCalls } = vi.hoisted(() => ({ mockTables: {}, eqCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let single = false
      const builder = {
        select() { return builder },
        eq(col, val) { eqCalls.push([table, col, val]); return builder },
        is() { return builder },
        in() { return builder },
        or() { return builder },
        not() { return builder },
        order() { return builder },
        maybeSingle() { single = true; return builder },
        then(resolve, reject) {
          const rows = mockTables[table] ?? []
          const data = single ? (Array.isArray(rows) ? rows.find(r => eqCalls.some(([t, c, v]) => t === table && c === 'id' && v === r.id)) ?? null : rows) : rows
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
    rpc() { return Promise.resolve({ data: [], error: null }) },
  },
}))

const late = vi.hoisted(() => ({ fetchLateArrivalsForProfile: vi.fn(), fetchMyLateArrivals: vi.fn() }))
vi.mock('../lib/lateArrivals', async () => ({ ...(await vi.importActual('../lib/lateArrivals')), ...late }))
vi.mock('../components/LateArrivalModal', () => ({
  default: ({ record, profileId, personName }) => <div role="dialog" aria-label="late form">{record ? `edit ${record.id}` : `new for ${personName} ${profileId}`}</div>,
}))

const OWN_LATE = { entry_date: '2026-11-02', shift_code: 'WD_08', shift_start: '08:00:00', arrived_at: '08:25:00', minutes_late: 25, reason_given: 'Car trouble' }
const ADMIN_LATE = { ...OWN_LATE, id: 'late-1', roster_entry_id: 'e1', logged_by: 'x', logger: { name: 'Pat', surname: 'Admin' } }

const doctor = (id, name) => ({ id, name, surname: 'Zephyr', role: 'doctor', category: 'MO', is_approved: true })

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}{location.search}</p>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Dashboard</p>} />
        <Route path="/my-year" element={<MyYearPage />} />
        <Route path="/my-year/:profileId" element={<MyYearPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('MyYearPage', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 24))
    eqCalls.length = 0
    late.fetchLateArrivalsForProfile.mockReset().mockResolvedValue([])
    late.fetchMyLateArrivals.mockReset().mockResolvedValue([])
    mockAuth = { profile: doctor(ME, 'Maurice'), isAdmin: false, canSubmitLeave: true }
    Object.assign(mockTables, {
      profiles: [doctor(ME, 'Maurice'), doctor(ADA, 'Ada')],
      leave_requests: [
        { id: 'a1', profile_id: ME, leave_type: 'annual', date_from: '2026-03-02', date_to: '2026-03-08', status: 'approved', annual_leave_days: 5, created_at: '2026-01-10T08:00:00Z' },
        { id: 'k1', profile_id: ME, leave_type: 'sick', date_from: '2026-11-18', date_to: '2026-11-19', status: 'approved', created_at: '2026-11-18T08:00:00Z' },
        { id: 'p1', profile_id: ME, leave_type: 'study', date_from: '2026-12-01', date_to: '2026-12-02', status: 'pending', created_at: '2026-11-20T08:00:00Z' },
      ],
      roster_months: [{ id: 'm11', year: 2026, month: 11, status: 'published' }],
      roster_entries: [
        { id: 'e1', roster_month_id: 'm11', date: '2026-11-02', profile_id: ME, is_locum: false, counts_toward_contract_hours: true, shift_types: { code: 'WD_08', label: '08h00', day_type: 'weekday', is_night_shift: false, start_time: '08:00:00' } },
        { id: 'e2', roster_month_id: 'm11', date: '2026-11-07', profile_id: ME, is_locum: false, counts_toward_contract_hours: true, shift_types: { code: 'WE_20', label: '20h00', day_type: 'weekend', is_night_shift: true, start_time: '20:00:00' } },
      ],
      public_holidays: [{ date: '2026-12-25', name: 'Christmas Day' }],
      app_settings: [],
    })
  })
  afterEach(() => { vi.useRealTimers() })

  it('shows the signed-in doctor their own year, with four tabs and the totals', async () => {
    renderAt('/my-year')
    expect(await screen.findByRole('heading', { level: 1, name: 'My year' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'My year' })).getAllByRole('button').map(b => b.textContent))
      .toEqual(['Overview', 'Leave', 'Shifts', 'Attendance'])

    const totals = screen.getByTestId('my-year-totals').textContent
    expect(totals).toMatch(/Days left\s*17/)
    expect(totals).toMatch(/Days booked\s*5\s*5 taken · 0 upcoming/)
    expect(totals).toMatch(/Pending requests\s*1/)
    expect(totals).toMatch(/Sick days\s*2\s*1 request/)
    expect(totals).toMatch(/Public holidays worked\s*0/)
    expect(totals).toMatch(/Days in lieu owed\s*0/)

    // Own page: the one filled button is Request leave; the phone back link goes to My leave.
    expect(screen.getByRole('button', { name: 'Request leave' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My leave' })).toHaveAttribute('href', '/leave?tab=my-leave')
    expect(screen.queryByRole('link', { name: 'All Leave' })).not.toBeInTheDocument()
  })

  it('names every day in the year grid and shows the breaks card', async () => {
    renderAt('/my-year')
    await screen.findByTestId('my-year-totals')
    expect(screen.getByRole('button', { name: '18 Nov: Sick leave' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '25 Dec: Christmas Day' })).toBeInTheDocument()

    const breaks = screen.getByTestId('my-year-breaks').textContent
    expect(breaks).toMatch(/2–8 Mar 2026 · 261 days ago/)
    expect(breaks).toMatch(/Over 120 days/)
    expect(breaks).toMatch(/None booked/)
  })

  it('opens the selected day with its leave, shift and links', async () => {
    renderAt('/my-year')
    await screen.findByTestId('my-year-totals')
    // It opens on today, under the grid.
    expect(screen.getByTestId('selected-day-card').textContent).toMatch(new RegExp(formatWeekdayDate(todayStr())))
    await userEvent.click(screen.getByRole('button', { name: '2 Nov' }))
    const card = screen.getByTestId('selected-day-card')
    expect(card.textContent).toMatch(/Monday, 2 Nov 2026/)
    expect(card.textContent).toMatch(/Not on leave/)
    expect(within(card).getByTestId('day-shift').textContent).toMatch(/^Rostered shift08h00/)
    // The roster opens on that day, marked as opened from My year.
    expect(within(card).getByRole('link', { name: /Open this day on the roster/ })).toHaveAttribute('href', '/roster/m11?date=2026-11-02&entry=e1&mark=1')
    // "Roster change history" is for admins.
    expect(within(card).queryByRole('link', { name: /Roster change history/ })).not.toBeInTheDocument()
  })

  it('opens a day\'s leave in Team Leave for an admin, in the planner for the doctor', async () => {
    renderAt('/my-year')
    await screen.findByTestId('my-year-totals')
    await userEvent.click(screen.getByRole('button', { name: '18 Nov: Sick leave' }))
    let card = screen.getByTestId('selected-day-card')
    expect(within(card).queryByRole('link', { name: /Team Leave/ })).not.toBeInTheDocument()
    // Sick leave isn't on any planner: the doctor's link opens the request itself.
    expect(within(card).getByRole('link', { name: /Open in My Requests/ })).toHaveAttribute('href', '/leave?tab=requests&request=k1')
    expect(within(card).queryByRole('link', { name: /Roster change history/ })).not.toBeInTheDocument()
  })

  it('on a phone: today stays above the grid; a day tapped in its month opens in a sheet with its links', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    try {
      renderAt('/my-year')
      await screen.findByTestId('my-year-totals')
      const todayCard = screen.getByTestId('selected-day-card')
      expect(todayCard.textContent).toMatch(new RegExp(formatWeekdayDate(todayStr())))
      // Today's month starts open; tap a day in it.
      await userEvent.click(within(screen.getByTestId('month-calendar')).getByRole('button', { name: '18 Nov: Sick leave' }))
      const sheet = await screen.findByTestId('day-sheet')
      expect(within(sheet).getByRole('link', { name: /My Requests/ })).toHaveAttribute('href', '/leave?tab=requests&request=k1')
      // The card above still says today.
      expect(screen.getByTestId('selected-day-card').textContent).toMatch(new RegExp(formatWeekdayDate(todayStr())))
      await userEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByTestId('day-sheet')).not.toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })

  it('gives an admin "Open in Team Leave" on the doctor\'s row and leave', async () => {
    mockAuth = { profile: doctor(ME, 'Maurice'), isAdmin: true, canSubmitLeave: true }
    renderAt('/my-year')
    await screen.findByTestId('my-year-totals')
    await userEvent.click(screen.getByRole('button', { name: '18 Nov: Sick leave' }))
    const card = screen.getByTestId('selected-day-card')
    expect(within(card).getByRole('link', { name: /Open in Team Leave/ }))
      .toHaveAttribute('href', `/leave?tab=team&sub=current&ldoctor=${ME}&lyear=2026&lrequest=k1`)
    // Captured by the doctor themselves: nothing said (no Captured row).
    expect(within(card).queryByTestId('day-captured')).not.toBeInTheDocument()
    expect(card.textContent).not.toMatch(/captured by/)
  })

  it('reads the tab and year from the URL and writes them back', async () => {
    renderAt('/my-year?tab=shifts&year=2026')
    const bars = await screen.findByTestId('my-year-shift-bars')
    expect(bars.textContent).toMatch(/08h00\s*1/)
    expect(bars.textContent).toMatch(/Weekend night\s*1/)
    expect(screen.getByTestId('my-year-lieu').textContent).toMatch(/does not earn one/)

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByTestId('location').textContent).toBe('/my-year?tab=leave&year=2026')
    expect(screen.getByTestId('leave-record-summary')).toHaveTextContent('3 requests · 7 days approved')
    // Not on someone else's page, so no Capture leave; and Request leave is Overview only.
    expect(screen.queryByRole('button', { name: /leave$/ })).not.toBeInTheDocument()
  })

  it('filters the leave record by type', async () => {
    renderAt('/my-year?tab=leave')
    await screen.findByTestId('leave-record-summary')
    const group = screen.getByRole('group', { name: 'Filter by leave type' })
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['All 3', 'Annual 1', 'Sick 1', 'Other 1'])
    await userEvent.click(within(group).getByRole('button', { name: /Sick/ }))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(table.textContent).toMatch(/18–19 Nov 2026.*Sick leave.*2.*Approved.*Off roster/s)
  })

  it('has one Go to… menu with the five destinations', async () => {
    renderAt('/my-year')
    await screen.findByTestId('my-year-totals')
    await userEvent.click(screen.getByRole('button', { name: /Go to/ }))
    const items = within(screen.getByRole('menu', { name: 'Go to' })).getAllByRole('menuitem')
    expect(items.map(i => i.textContent)).toEqual(['Account', 'Annual planner', 'Special planner', 'Roster', 'Hours Summary'])
    expect(items[0]).toHaveAttribute('href', '/account')
  })

  it('sends a non-admin who opens someone else\'s year back to their own', async () => {
    renderAt(`/my-year/${ADA}?tab=leave`)
    expect(await screen.findByRole('heading', { level: 1, name: 'My year' })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/my-year?tab=leave')
  })

  it('is not available to someone who cannot submit leave (a locum or clerk)', async () => {
    mockAuth = { profile: { id: ME, role: 'locum' }, isAdmin: false, canSubmitLeave: false }
    renderAt('/my-year')
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('lets an admin open another doctor\'s year', async () => {
    mockAuth = { profile: doctor(ME, 'Maurice'), isAdmin: true, canSubmitLeave: true }
    mockTables.leave_requests = []
    renderAt(`/my-year/${ADA}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Ada’s year' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All Leave' })).toHaveAttribute('href', '/leave?tab=team&sub=all')
    // No filled button on an admin's Overview…
    expect(screen.queryByRole('button', { name: 'Request leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Capture leave' })).not.toBeInTheDocument()
    // …Capture leave on the Leave tab.
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByRole('button', { name: 'Capture leave' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Go to/ }))
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', `/account/${ADA}`)
  })

  it('hides Attendance from staff when the setting is off, and never from admins', async () => {
    mockTables.app_settings = [{ key: 'attendance_visible_to_staff', value: 'false' }]
    const first = renderAt('/my-year?tab=attendance')
    await screen.findByTestId('my-year-totals')
    expect(screen.queryByRole('button', { name: 'Attendance' })).not.toBeInTheDocument()
    first.unmount()

    mockAuth = { profile: doctor(ME, 'Maurice'), isAdmin: true, canSubmitLeave: true }
    renderAt('/my-year?tab=attendance')
    expect(await screen.findByText('No late arrivals recorded.')).toBeInTheDocument()
  })

  it('shows a doctor their own late arrivals, with the reason and never who logged it', async () => {
    late.fetchMyLateArrivals.mockResolvedValue([OWN_LATE])
    renderAt('/my-year?tab=attendance')
    const table = await screen.findByTestId('late-arrivals-table')
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Date', 'Shift', 'Shift start', 'Arrived', 'Late by', 'Reason given'])
    expect(table.textContent).toMatch(/Mon, 2 Nov 2026.*08h00.*08h25.*25 min.*Car trouble/s)
    expect(screen.getByText('Shift start, arrival time and your reason, as recorded. Speak to an admin if a record looks wrong.')).toBeInTheDocument()
    expect(screen.getByText('Late arrivals').parentElement.textContent).toMatch(/1 this year/)
    // The own view reads through the function, never the table, and has nothing to edit or log.
    expect(late.fetchMyLateArrivals).toHaveBeenCalledWith(2026)
    expect(late.fetchLateArrivalsForProfile).not.toHaveBeenCalled()
    expect(screen.queryByText(/Logged by/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /late arrival/i })).not.toBeInTheDocument()
  })

  it('marks late days on the year grid for the doctor', async () => {
    late.fetchMyLateArrivals.mockResolvedValue([OWN_LATE])
    renderAt('/my-year')
    expect(await screen.findByRole('button', { name: '2 Nov: Late arrival' })).toBeInTheDocument()
    expect(screen.getAllByTestId('late-dot')).toHaveLength(1)
  })

  it('with staff visibility off, a doctor sees no Attendance tab and no dots', async () => {
    mockTables.app_settings = [{ key: 'attendance_visible_to_staff', value: 'false' }]
    // The database function returns nothing in this state; even if rows arrived they would not show.
    late.fetchMyLateArrivals.mockResolvedValue([OWN_LATE])
    renderAt('/my-year')
    await screen.findByTestId('my-year-totals')
    expect(screen.queryByRole('button', { name: 'Attendance' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('late-dot')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Late arrival/ })).not.toBeInTheDocument()
  })

  it('gives an admin the full record for another doctor: Logged by, edit on a row, and Log late arrival', async () => {
    mockAuth = { profile: doctor(ME, 'Maurice'), isAdmin: true, canSubmitLeave: true }
    late.fetchLateArrivalsForProfile.mockResolvedValue([ADMIN_LATE])
    renderAt(`/my-year/${ADA}?tab=attendance`)
    const table = await screen.findByTestId('late-arrivals-table')
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Date', 'Shift', 'Shift start', 'Arrived', 'Late by', 'Reason given', 'Logged by', 'Open in'])
    expect(table.textContent).toMatch(/Pat Admin/)
    expect(within(table).getByRole('link', { name: 'Roster' })).toHaveAttribute('href', '/roster/m11?date=2026-11-02&entry=e1&mark=1')
    expect(late.fetchLateArrivalsForProfile).toHaveBeenCalledWith(ADA, 2026)
    expect(screen.queryByText(/Speak to an admin/)).not.toBeInTheDocument()

    await userEvent.click(within(table).getByRole('button', { name: /Edit late arrival/ }))
    expect(screen.getByRole('dialog', { name: 'late form' })).toHaveTextContent('edit late-1')
  })

  it('opens the form for that doctor from the Log late arrival button', async () => {
    mockAuth = { profile: doctor(ME, 'Maurice'), isAdmin: true, canSubmitLeave: true }
    renderAt(`/my-year/${ADA}?tab=attendance`)
    await userEvent.click(await screen.findByRole('button', { name: 'Log late arrival' }))
    expect(screen.getByRole('dialog', { name: 'late form' })).toHaveTextContent(`new for Ada Zephyr ${ADA}`)
  })
})
