import { describe, it, expect } from 'vitest'
import { buildMonthAuditRows, monthShadeStep, sinceLastBreak, sinceLastBreakText } from './leaveAuditByMonth'

const profiles = [
  { id: 'p1', name: 'Ada', surname: 'Zephyr', category: 'MO', contract_type: 'full' },
  { id: 'p2', name: 'Bo', surname: 'Adams', category: 'Registrar', contract_type: 'five_eighths' },
  { id: 'p3', name: 'Cy', surname: 'Moyo', category: 'MO' },
]
let n = 0
const lr = (profile_id, leave_type, date_from, date_to, extra = {}) => ({ id: `r${++n}`, profile_id, leave_type, date_from, date_to, status: 'approved', annual_leave_days: null, ...extra })
const requests = [
  lr('p1', 'annual', '2026-01-28', '2026-02-10', { annual_leave_days: 10 }),
  lr('p1', 'annual', '2026-06-28', '2026-07-07', { annual_leave_days: 7 }),
  lr('p1', 'annual', '2026-12-29', '2027-01-02', { annual_leave_days: 5 }),
  lr('p1', 'sick', '2026-03-30', '2026-04-02'),
  lr('p1', 'study', '2026-08-31', '2026-09-04'),
  lr('p1', 'weekend_exception', '2026-05-16', '2026-05-17'),
  lr('p1', 'sick', '2026-05-20', '2026-05-21', { status: 'pending' }),
  lr('p2', 'sick', '2026-02-01', '2026-02-02'),
  lr('p2', 'annual', '2026-10-05', '2026-10-07', { annual_leave_days: 3 }),
]
const opts = { today: '2026-11-24', allowance: 22, longBreakDays: 120, breakRequests: requests }

describe('monthShadeStep', () => {
  it('has four steps: none, 1–2, 3–5, 6 or more', () => {
    expect([0, 1, 2, 3, 5, 6, 31].map(monthShadeStep)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })
})

describe('buildMonthAuditRows', () => {
  const rows = buildMonthAuditRows(profiles, requests, 2026, opts)

  it('lists every doctor, by surname, including one with no leave', () => {
    expect(rows.map(r => r.surname)).toEqual(['Adams', 'Moyo', 'Zephyr'])
    expect(rows[1]).toMatchObject({ total: 0, annual: 0, sick: 0, other: 0, annualLeft: 22 })
    expect(rows[1].months).toEqual(Array(12).fill(0))
  })

  it('holds the invariant for every doctor: months add up to Total days = Annual booked + Sick + Other', () => {
    for (const row of rows) {
      expect(row.months.reduce((s, d) => s + d, 0)).toBe(row.total)
      expect(row.total).toBe(row.annual + row.sick + row.other)
    }
  })

  it('splits the year into annual booked, annual left, sick and other', () => {
    const ada = rows[2]
    expect(ada).toMatchObject({ annual: 20, annualLeft: 2, sick: 4, other: 5, total: 29, contractType: 'full' })
    // Pending and weekend-off requests never reach a month.
    expect(ada.months[4]).toBe(0)
    expect(ada.entries[2].map(e => e.days)).toEqual([2])
  })

  it('shows the break column as loading until the look-back arrives', () => {
    const loading = buildMonthAuditRows(profiles, requests, 2026, { ...opts, breakRequests: null })
    expect(loading.every(r => r.sinceBreak.kind === 'loading')).toBe(true)
    expect(sinceLastBreakText(loading[0].sinceBreak)).toBe('…')
  })
})

describe('sinceLastBreak', () => {
  it('counts days since a break this year, and flags a long gap', () => {
    const since = sinceLastBreak([lr('p1', 'annual', '2026-06-28', '2026-07-07')], 2026, '2026-11-24', 120)
    expect(since).toEqual({ kind: 'days', days: 140, long: true })
    expect(sinceLastBreakText(since)).toBe('140 days')
    expect(sinceLastBreak([lr('p1', 'annual', '2026-10-01', '2026-10-07')], 2026, '2026-11-24', 120).long).toBe(false)
  })

  it('reads "None this year" when the last break was earlier, still flagged when long', () => {
    const since = sinceLastBreak([lr('p1', 'annual', '2025-10-06', '2025-10-12')], 2026, '2026-11-24', 120)
    expect(since).toMatchObject({ kind: 'none_this_year', long: true })
    expect(sinceLastBreakText(since)).toBe('None this year')
  })

  it('reads "None since joining" with no break on record (short leave does not count)', () => {
    const since = sinceLastBreak([lr('p2', 'annual', '2026-10-05', '2026-10-07')], 2026, '2026-11-24', 120)
    expect(since).toEqual({ kind: 'none_since_joining', days: null, long: false })
    expect(sinceLastBreakText(since)).toBe('None since joining')
  })
})
