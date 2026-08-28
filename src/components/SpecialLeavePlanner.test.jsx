import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SpecialLeavePlanner from './SpecialLeavePlanner'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'p1' }, isClerk: false }),
}))

// The real grid is covered by LeaveYearGrid.test.jsx — stubbed to a flat
// readout of exactly what reaches it, so these tests assert which rows the
// planner admits rather than how they're drawn.
vi.mock('./LeaveYearGrid', () => ({
  default: ({ leaveByDate, ruleBullets }) => (
    <div>
      <div data-testid="grid">
        {[...leaveByDate].flatMap(([date, entries]) => entries.map(e => `${date}:${e.leaveType}:${e.surname}`)).join('|')}
      </div>
      {/* The rules now ride along to the grid's own Legend sheet rather
          than rendering as a card here, so this is where the test can see
          what copy the planner hands over. */}
      <div data-testid="rule-bullets">{(ruleBullets || []).join('|')}</div>
    </div>
  ),
}))

vi.mock('../lib/internRotations', () => ({
  fetchInternRotationsForDoctorIds: () => Promise.resolve([]),
  groupRotationsByDoctorId: () => new Map(),
}))

const ROWS = [
  { profile_id: 'p1', date_from: '2026-08-03', date_to: '2026-08-03', leave_type: 'course', status: 'approved', profiles: { name: 'Ada', surname: 'Nolan', category: 'MO' } },
  { profile_id: 'p2', date_from: '2026-08-04', date_to: '2026-08-04', leave_type: 'sick', status: 'approved', profiles: { name: 'Bo', surname: 'Reddy', category: 'MO' } },
  // Both a pending and an approved weekend exception — the pending one is
  // the regression guard: it used to slip in via the "any pending request"
  // arm of the .or() even once the type itself was excluded.
  { profile_id: 'p3', date_from: '2026-08-01', date_to: '2026-08-02', leave_type: 'weekend_exception', status: 'approved', profiles: { name: 'Cy', surname: 'Patel', category: 'MO' } },
  { profile_id: 'p4', date_from: '2026-08-08', date_to: '2026-08-09', leave_type: 'weekend_exception', status: 'pending', profiles: { name: 'Di', surname: 'Khan', category: 'MO' } },
]

// Records .neq() and applies it to the returned rows, so "excluded from the
// grid" is actually exercised end to end rather than merely asserted as a
// method call. Everything else resolves as a pass-through.
const { mockResponses, calls } = vi.hoisted(() => ({ mockResponses: {}, calls: { neq: [], or: [] } }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      const neqs = []
      const builder = {
        select() { return builder },
        or(expr) { calls.or.push(expr); return builder },
        neq(col, val) { neqs.push([col, val]); calls.neq.push([col, val]); return builder },
        eq() { return builder },
        in() { return builder },
        gte() { return builder },
        lte() { return builder },
        then(resolve, reject) {
          const result = mockResponses[table] || { data: [], error: null }
          const data = (result.data || []).filter(row => neqs.every(([col, val]) => row[col] !== val))
          return Promise.resolve({ ...result, data }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

describe('SpecialLeavePlanner', () => {
  beforeEach(() => {
    calls.neq.length = 0
    calls.or.length = 0
    mockResponses.leave_requests = { data: ROWS, error: null }
    mockResponses.public_holidays = { data: [], error: null }
  })

  it('excludes weekend exceptions from the grid at every status', async () => {
    render(<SpecialLeavePlanner />)
    const grid = await screen.findByTestId('grid')

    // Genuine special leave (and sick) still land here.
    expect(grid).toHaveTextContent('Nolan')
    expect(grid).toHaveTextContent('Reddy')

    // Neither the approved nor the pending weekend exception does — they
    // belong to the Weekend Planner's Selected month panel instead.
    expect(grid).not.toHaveTextContent('Patel')
    expect(grid).not.toHaveTextContent('Khan')
    expect(grid).not.toHaveTextContent('weekend_exception')
  })

  it('excludes them at the query, not just in rendering', async () => {
    render(<SpecialLeavePlanner />)
    await screen.findByTestId('grid')
    expect(calls.neq).toContainEqual(['leave_type', 'weekend_exception'])
    // Still chained alongside the non-annual/pending filter, which the
    // weekend-exception exclusion narrows rather than replaces.
    expect(calls.or).toContain('leave_type.neq.annual,status.eq.pending')
  })

  it('hands the grid rule copy saying where weekend exceptions went, with no standalone info card', async () => {
    render(<SpecialLeavePlanner />)
    await screen.findByTestId('grid')
    expect(screen.getByTestId('rule-bullets')).toHaveTextContent(/Weekend exceptions are not shown here/)
    // The permanently-open card (and its own "How it works" trigger) is
    // gone — the Legend sheet inside the grid is the single entry point now.
    expect(screen.queryByRole('button', { name: 'How it works' })).not.toBeInTheDocument()
  })
})
