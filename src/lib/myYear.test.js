import { describe, it, expect } from 'vitest'
import {
  readMyYearSettings, leaveBucket, leaveDaysByMonth, buildMonthRow, leaveTotals, breakRanges, breakSummary,
  lieuEarnedRows, lieuBalance, lieuBalancesByProfile, shiftGroupOf, shiftCounts, onCallDates, leaveRecord,
  coverForRequest, coverSummary, shiftsAffected, coverNote, buildYearDays, yearWeekColumns, daysByMonth,
} from './myYear'

let seq = 0
const leave = (leave_type, date_from, date_to, extra = {}) => ({
  id: `lr${++seq}`, profile_id: 'p1', leave_type, date_from, date_to, status: 'approved', annual_leave_days: null, ...extra,
})
const ST = {
  WD_08: { code: 'WD_08', day_type: 'weekday', is_night_shift: false, start_time: '08:00:00' },
  WD_12: { code: 'WD_12', day_type: 'weekday', is_night_shift: false, start_time: '12:00:00' },
  WD_15: { code: 'WD_15', day_type: 'weekday', is_night_shift: false, start_time: '15:00:00' },
  WD_22: { code: 'WD_22', day_type: 'weekday', is_night_shift: true, start_time: '22:00:00' },
  WE_08: { code: 'WE_08', day_type: 'weekend', is_night_shift: false, start_time: '08:00:00' },
  WE_20: { code: 'WE_20', day_type: 'weekend', is_night_shift: true, start_time: '20:00:00' },
  PH_08: { code: 'PH_08', day_type: 'PH', is_night_shift: false, start_time: '08:00:00' },
  PHW_22: { code: 'PHW_22', day_type: 'PH_weekday', is_night_shift: true, start_time: '22:00:00' },
}
const entry = (date, code, extra = {}) => ({
  id: `e${++seq}`, roster_month_id: `m-${date.slice(0, 7)}`, date, profile_id: 'p1', is_locum: false,
  counts_toward_contract_hours: true, shift_types: ST[code], ...extra,
})
const HOLIDAYS = new Map([['2026-12-16', 'Day of Reconciliation'], ['2026-12-25', 'Christmas Day']])

describe('readMyYearSettings', () => {
  it('falls back to the migration defaults when rows are missing', () => {
    expect(readMyYearSettings([])).toEqual({ attendanceVisibleToStaff: true, longBreakDays: 120, lieuCountNightBefore: false })
  })
  it('reads the stored values', () => {
    expect(readMyYearSettings([
      { key: 'attendance_visible_to_staff', value: 'false' },
      { key: 'my_year_long_break_days', value: '90' },
      { key: 'lieu_count_night_before_ph', value: 'true' },
    ])).toEqual({ attendanceVisibleToStaff: false, longBreakDays: 90, lieuCountNightBefore: true })
  })
})

describe('leave days', () => {
  it('buckets types into annual, sick and other', () => {
    expect(['annual', 'sick', 'study', 'time_off_in_lieu'].map(leaveBucket)).toEqual(['annual', 'sick', 'other', 'other'])
  })

  it('counts annual_leave_days for annual leave and calendar days for the rest', () => {
    const al = leave('annual', '2026-03-07', '2026-03-15', { annual_leave_days: 5 })
    const sk = leave('sick', '2026-03-20', '2026-03-22')
    expect(leaveDaysByMonth(al, 2026)[2]).toBe(5)
    expect(leaveDaysByMonth(sk, 2026)[2]).toBe(3)
  })

  it('shares annual leave across a month end so the months add up to the request', () => {
    // 10 calendar days, 7 leave days: 3 in June, 7 in July by calendar.
    const al = leave('annual', '2026-06-28', '2026-07-07', { annual_leave_days: 7 })
    const months = leaveDaysByMonth(al, 2026)
    expect(months[5] + months[6]).toBe(7)
    expect(months[5]).toBe(2)
    expect(months[6]).toBe(5)
  })

  it('only counts the part of a request inside the year', () => {
    const al = leave('annual', '2026-12-29', '2027-01-02', { annual_leave_days: 5 })
    expect(leaveDaysByMonth(al, 2026).reduce((s, d) => s + d, 0)).toBe(3)
    expect(leaveDaysByMonth(al, 2027).reduce((s, d) => s + d, 0)).toBe(2)
  })

  it('holds the invariant: months add up to the total, and the total is annual + sick + other', () => {
    const requests = [
      leave('annual', '2026-01-28', '2026-02-10', { annual_leave_days: 10 }),
      leave('annual', '2026-06-28', '2026-07-07', { annual_leave_days: 7 }),
      leave('annual', '2026-12-29', '2027-01-02', { annual_leave_days: 5 }),
      leave('sick', '2026-03-30', '2026-04-02'),
      leave('study', '2026-08-31', '2026-09-04'),
      leave('time_off_in_lieu', '2026-10-01', '2026-10-01'),
      leave('annual', '2026-05-01', '2026-05-05', { status: 'pending', annual_leave_days: 3 }),
      leave('sick', '2026-05-10', '2026-05-12', { status: 'cancelled' }),
      leave('weekend_exception', '2026-05-16', '2026-05-17'),
    ]
    const row = buildMonthRow(requests, 2026)
    expect(row.months.reduce((s, d) => s + d, 0)).toBe(row.total)
    expect(row.total).toBe(row.annual + row.sick + row.other)
    expect(row.annual).toBe(10 + 7 + 3)
    expect(row.sick).toBe(4)
    expect(row.other).toBe(6)
    // Pending, cancelled and weekend-off requests never reach a month.
    expect(row.months[4]).toBe(0)
    expect(row.entries[4]).toEqual([])
  })

  it('lists the leave behind each month', () => {
    const row = buildMonthRow([leave('sick', '2026-03-30', '2026-04-02')], 2026)
    expect(row.entries[2].map(e => e.days)).toEqual([2])
    expect(row.entries[3].map(e => e.days)).toEqual([2])
  })

  it('builds the totals card', () => {
    const requests = [
      leave('annual', '2026-02-02', '2026-02-06', { annual_leave_days: 5 }),
      leave('annual', '2026-12-14', '2026-12-18', { annual_leave_days: 5 }),
      leave('annual', '2026-12-28', '2026-12-30', { annual_leave_days: 3, status: 'pending' }),
      leave('sick', '2026-04-01', '2026-04-02'),
      leave('sick', '2026-09-09', '2026-09-09'),
      leave('weekend_exception', '2026-05-16', '2026-05-17', { status: 'pending' }),
    ]
    expect(leaveTotals(requests, 2026, '2026-11-24', 22)).toEqual({
      allowance: 22, daysLeft: 12, daysBooked: 10, daysTaken: 5, daysUpcoming: 5,
      pendingRequests: 1, sickDays: 3, sickRequests: 2,
    })
  })
})

describe('breaks', () => {
  it('needs 5 or more consecutive calendar days, merging requests that touch', () => {
    const requests = [
      leave('annual', '2026-03-02', '2026-03-04'),
      leave('annual', '2026-03-05', '2026-03-06'),
      leave('annual', '2026-06-01', '2026-06-03'),
      leave('sick', '2026-08-01', '2026-08-20'),
    ]
    expect(breakRanges(requests)).toEqual([{ from: '2026-03-02', to: '2026-03-06', days: 5 }])
  })

  it('reports the last break, the longest stretch and the next booked break', () => {
    const requests = [
      leave('annual', '2026-03-02', '2026-03-08'),
      leave('annual', '2026-12-14', '2026-12-20'),
    ]
    const s = breakSummary(requests, 2026, '2026-11-24')
    expect(s.last).toMatchObject({ from: '2026-03-02', to: '2026-03-08', daysAgo: 261, ongoing: false })
    expect(s.next).toMatchObject({ from: '2026-12-14', daysAway: 20 })
    // 9 March to 24 November inclusive.
    expect(s.longestStretch).toBe(261)
    expect(s.breakThisYear).toBe(true)
    expect(s.noneSinceJoining).toBe(false)
  })

  it('looks back before the displayed year for the last break', () => {
    const s = breakSummary([leave('annual', '2025-10-06', '2025-10-12')], 2026, '2026-02-01')
    expect(s.last).toMatchObject({ to: '2025-10-12', daysAgo: 112 })
    expect(s.breakThisYear).toBe(false)
  })

  it('reads "none since joining" with no break on record', () => {
    const s = breakSummary([leave('annual', '2026-03-02', '2026-03-03')], 2026, '2026-11-24', { startDate: '2026-07-01' })
    expect(s.last).toBeNull()
    expect(s.noneSinceJoining).toBe(true)
    // From the start date, not 1 January.
    expect(s.longestStretch).toBe(147)
  })
})

describe('days in lieu', () => {
  it('earns one per public holiday shift worked', () => {
    const entries = [entry('2026-12-16', 'PHW_22'), entry('2026-12-25', 'PH_08'), entry('2026-12-17', 'WD_08')]
    const rows = lieuEarnedRows(entries, HOLIDAYS, { profileId: 'p1' })
    expect(rows.map(r => [r.date, r.holidayName, r.shiftCode])).toEqual([
      ['2026-12-16', 'Day of Reconciliation', 'PHW_22'],
      ['2026-12-25', 'Christmas Day', 'PH_08'],
    ])
  })

  it('earns nothing for a vacated doctor, a locum shift, or a shift held over approved leave', () => {
    const entries = [
      entry('2026-12-16', 'PHW_22', { profile_id: null, vacated_profile_id: 'p1' }),
      entry('2026-12-25', 'PH_08', { is_locum: true }),
    ]
    expect(lieuEarnedRows(entries, HOLIDAYS, { profileId: 'p1' })).toEqual([])
    expect(lieuEarnedRows([entry('2026-12-25', 'PH_08')], HOLIDAYS, { profileId: 'p1', leaveRanges: [['2026-12-24', '2026-12-26']] })).toEqual([])
  })

  it('counts the night before a holiday only when the setting says so', () => {
    const entries = [entry('2026-12-15', 'WD_22'), entry('2026-12-15', 'WD_08')]
    expect(lieuEarnedRows(entries, HOLIDAYS, { profileId: 'p1' })).toEqual([])
    const rows = lieuEarnedRows(entries, HOLIDAYS, { profileId: 'p1', countNightBefore: true })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2026-12-15', holidayDate: '2026-12-16', nightBefore: true })
  })

  it('owes earned minus taken, never below 0', () => {
    const entries = [entry('2026-12-16', 'PHW_22'), entry('2026-12-25', 'PH_08')]
    expect(lieuBalance(entries, HOLIDAYS, [leave('time_off_in_lieu', '2027-01-05', '2027-01-05')], { profileId: 'p1' }))
      .toMatchObject({ earned: 2, taken: 1, owed: 1 })
    expect(lieuBalance([], HOLIDAYS, [leave('time_off_in_lieu', '2027-01-05', '2027-01-07')], { profileId: 'p1' }))
      .toMatchObject({ earned: 0, taken: 3, owed: 0 })
    expect(lieuBalance(entries, HOLIDAYS, [leave('time_off_in_lieu', '2027-01-05', '2027-01-05', { status: 'pending' })], { profileId: 'p1' }).taken).toBe(0)
  })

  it('gives Hours Summary the same figures per doctor', () => {
    const entries = [entry('2026-12-16', 'PHW_22'), entry('2026-12-25', 'PH_08'), entry('2026-12-25', 'PH_08', { profile_id: 'p2' })]
    const requests = [leave('time_off_in_lieu', '2027-01-05', '2027-01-05')]
    const all = lieuBalancesByProfile(entries, HOLIDAYS, requests)
    const one = lieuBalance(entries, HOLIDAYS, requests, { profileId: 'p1' })
    expect(all.p1).toEqual({ earned: one.earned, taken: one.taken, owed: one.owed })
    expect(all.p2).toEqual({ earned: 1, taken: 0, owed: 1 })
  })
})

describe('shifts worked', () => {
  it('groups by day type, night flag and start time', () => {
    expect(Object.keys(ST).map(c => shiftGroupOf(ST[c]))).toEqual(['wd08', 'wd12', 'wd15', 'wd22', 'weDay', 'weNight', 'weDay', 'weNight'])
    expect(shiftGroupOf(null)).toBeNull()
  })

  it('counts the year, skipping locum shifts, other years, other people and shifts on leave', () => {
    const entries = [
      entry('2026-11-02', 'WD_08'), entry('2026-11-03', 'WD_08'), entry('2026-11-07', 'WE_20'),
      entry('2026-12-25', 'PH_08'),
      entry('2026-11-04', 'WD_12', { counts_toward_contract_hours: false }),
      entry('2025-11-04', 'WD_12'),
      entry('2026-11-05', 'WD_15', { profile_id: 'p2' }),
      entry('2026-11-10', 'WD_22'),
    ]
    const { counts, total } = shiftCounts(entries, { profileId: 'p1', year: 2026, leaveRanges: [['2026-11-10', '2026-11-10']] })
    expect(counts).toEqual({ wd08: 2, wd12: 0, wd15: 0, wd22: 0, weDay: 1, weNight: 1 })
    expect(total).toBe(4)
  })

  it('lists a consultant\'s on-call days', () => {
    const entries = [
      entry('2026-11-02', 'WD_08', { profile_id: null, consultant_profile_id: 'c1' }),
      entry('2026-11-02', 'WD_12', { profile_id: null, consultant_profile_id: 'c1' }),
      entry('2026-11-03', 'WD_08', { profile_id: null, consultant_profile_id: 'c2' }),
    ]
    expect(onCallDates(entries, 'c1', 2026)).toEqual(['2026-11-02'])
  })
})

describe('leave record', () => {
  it('lists every request touching the year, newest first, without weekend-off requests', () => {
    const requests = [
      leave('annual', '2026-02-02', '2026-02-06'),
      leave('sick', '2026-09-09', '2026-09-09', { status: 'cancelled' }),
      leave('study', '2025-12-30', '2026-01-02'),
      leave('annual', '2025-06-01', '2025-06-05'),
      leave('weekend_exception', '2026-05-16', '2026-05-17'),
    ]
    const rows = leaveRecord(requests, 2026)
    expect(rows.map(r => r.date_from)).toEqual(['2026-09-09', '2026-02-02', '2025-12-30'])
  })

  it('describes the cover on the shifts a request vacated', () => {
    const request = leave('sick', '2026-11-18', '2026-11-19')
    const opts = { profileId: 'p1', publishedMonths: new Set(['2026-11']), today: '2026-11-24' }
    const vacated = extra => entry('2026-11-18', 'WD_08', { profile_id: null, vacated_profile_id: 'p1', vacated_leave_request_id: request.id, ...extra })

    expect(coverSummary(coverForRequest(request, [vacated({ is_locum: true })], opts))).toBe('08h00 · open locum slot')
    expect(coverSummary(coverForRequest(request, [vacated({ is_locum: true, locum_name: 'Dr Smith' })], opts))).toBe('08h00 · locum')
    expect(coverSummary(coverForRequest(request, [vacated({ profile_id: 'p2' })], opts))).toBe('08h00 · covered by a colleague')
    expect(coverSummary(coverForRequest(request, [vacated()], opts))).toBe('08h00 · not covered')
    // Still on the shift while on approved leave: nobody is covering it.
    expect(coverSummary(coverForRequest(request, [entry('2026-11-19', 'WD_12')], opts))).toBe('12h00 · not covered')
    expect(coverSummary(coverForRequest(request, [vacated({ profile_id: 'p2' }), entry('2026-11-19', 'WD_12')], opts))).toBe('2 shifts · 1 not covered')
  })

  it('reads "Off roster" for a rostered period with no shift, and "Not yet rostered" ahead of the roster', () => {
    const opts = { profileId: 'p1', publishedMonths: new Set(['2026-11']), today: '2026-11-24' }
    expect(coverSummary(coverForRequest(leave('annual', '2026-11-10', '2026-11-12'), [], opts))).toBe('Off roster')
    expect(coverSummary(coverForRequest(leave('annual', '2026-12-14', '2026-12-18'), [], opts))).toBe('Not yet rostered')
    expect(coverSummary(coverForRequest(leave('annual', '2026-02-02', '2026-02-06'), [], opts))).toBe('Off roster')
  })
})

describe('year at a glance', () => {
  const days = buildYearDays(2026, {
    requests: [leave('sick', '2026-11-18', '2026-11-18'), leave('annual', '2026-11-18', '2026-11-20'), leave('annual', '2026-01-05', '2026-01-06', { status: 'pending' })],
    holidays: HOLIDAYS,
    entries: [entry('2026-11-18', 'WD_08'), entry('2026-11-21', 'WE_08', { profile_id: null, consultant_profile_id: 'p1' })],
    profileId: 'p1',
    lateDates: new Set(['2026-11-02']),
  })
  const on = date => days.find(d => d.date === date)

  it('has one entry per day', () => {
    expect(days).toHaveLength(365)
  })

  it('marks leave, weekends, holidays, shifts, on-call days and late arrivals', () => {
    expect(on('2026-11-18')).toMatchObject({ leaveGroup: 'annual', weekend: false })
    expect(on('2026-11-18').shift.shift_types.code).toBe('WD_08')
    expect(on('2026-11-21')).toMatchObject({ weekend: true, onCall: true, leave: null })
    expect(on('2026-12-25').holidayName).toBe('Christmas Day')
    expect(on('2026-11-02').late).toBe(true)
    // Pending leave is not shown as leave.
    expect(on('2026-01-05').leave).toBeNull()
  })

  it('lays the days out as Monday-to-Sunday week columns and as months', () => {
    const columns = yearWeekColumns(days)
    // 1 January 2026 is a Thursday.
    expect(columns[0].map(d => d?.date ?? null)).toEqual([null, null, null, '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])
    expect(columns.flat().filter(Boolean)).toHaveLength(365)
    expect(daysByMonth(days).map(m => m.length)).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
  })
})

describe('Leave tab columns: shifts affected and cover note', () => {
  const opts = { profileId: 'p1', publishedMonths: new Set(['2026-11']), today: '2026-11-24' }
  const ST12 = { code: 'WD_12', day_type: 'weekday', is_night_shift: false, start_time: '12:00:00', end_time: '22:00:00' }
  const shiftOn = (date, extra) => ({ id: `s-${date}`, roster_month_id: 'm', date, shift_types: ST12, ...extra })

  it('names one shift by its times, more by a count', () => {
    const r = leave('sick', '2026-11-25', '2026-11-26')
    const one = coverForRequest(r, [shiftOn('2026-11-25', { profile_id: null, vacated_profile_id: 'p1', vacated_leave_request_id: r.id })], opts)
    expect(shiftsAffected(one)).toBe('12h–22h')
    const two = coverForRequest(r, [
      shiftOn('2026-11-25', { profile_id: null, vacated_profile_id: 'p1', vacated_leave_request_id: r.id }),
      shiftOn('2026-11-26', { profile_id: 'p2', vacated_profile_id: 'p1', vacated_leave_request_id: r.id }),
    ], opts)
    expect(shiftsAffected(two)).toBe('2 shifts affected')
    expect(coverNote(two)).toBe('1 of 2 not covered')
    expect(shiftsAffected(coverForRequest(leave('annual', '2026-11-10', '2026-11-12'), [], opts))).toBe('—')
  })

  it('reads Covered, Not covered, Off roster or Not yet rostered', () => {
    const r = leave('sick', '2026-11-25', '2026-11-25')
    const covered = coverForRequest(r, [shiftOn('2026-11-25', { profile_id: 'p2', vacated_profile_id: 'p1', vacated_leave_request_id: r.id })], opts)
    expect(coverNote(covered)).toBe('Covered')
    const notCovered = coverForRequest(r, [shiftOn('2026-11-25', { profile_id: null, is_locum: true, vacated_profile_id: 'p1', vacated_leave_request_id: r.id })], opts)
    expect(coverNote(notCovered)).toBe('Not covered')
    expect(coverNote(coverForRequest(leave('annual', '2026-11-10', '2026-11-12'), [], opts))).toBe('Off roster')
    expect(coverNote(coverForRequest(leave('annual', '2026-12-14', '2026-12-18'), [], opts))).toBe('Not yet rostered')
  })
})
