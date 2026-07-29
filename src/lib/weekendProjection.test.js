import { describe, it, expect } from 'vitest'
import { projectWorkingWeekends, projectTeamWeekends } from './weekendProjection'

describe('projectWorkingWeekends', () => {
  it('projects alternating days/nights weekends stepping every 14 days', () => {
    const pattern = { last_worked_weekend: '2026-08-01', next_weekend_type: 'nights' }
    const weekends = projectWorkingWeekends(pattern, { fromDate: '2026-08-01', throughDate: '2026-09-15' })
    expect(weekends).toEqual([
      { saturday: '2026-08-15', sunday: '2026-08-16', type: 'nights' },
      { saturday: '2026-08-29', sunday: '2026-08-30', type: 'days' },
      { saturday: '2026-09-12', sunday: '2026-09-13', type: 'nights' },
    ])
  })

  it('returns nothing for a doctor with no tracked weekend history', () => {
    expect(projectWorkingWeekends(null, { fromDate: '2026-08-01', throughDate: '2026-12-31' })).toEqual([])
    expect(projectWorkingWeekends({}, { fromDate: '2026-08-01', throughDate: '2026-12-31' })).toEqual([])
  })
})

describe('projectTeamWeekends', () => {
  it('groups multiple doctors by weekend, split into days/nights', () => {
    const rows = [
      { profile_id: 'p1', name: 'Eveline', surname: 'Baerends', last_worked_weekend: '2026-08-01', next_weekend_type: 'days' },
      { profile_id: 'p2', name: 'Harold', surname: 'Humphrey', last_worked_weekend: '2026-08-08', next_weekend_type: 'nights' },
    ]
    const grouped = projectTeamWeekends(rows, { fromDate: '2026-08-01', throughDate: '2026-08-25' })

    // p1's next weekend: 08-15 (days). p2's next weekend: 08-22 (nights).
    expect(grouped).toEqual([
      { saturday: '2026-08-15', sunday: '2026-08-16', days: [{ profileId: 'p1', name: 'Eveline', surname: 'Baerends' }], nights: [] },
      { saturday: '2026-08-22', sunday: '2026-08-23', days: [], nights: [{ profileId: 'p2', name: 'Harold', surname: 'Humphrey' }] },
    ])
  })

  it('puts two doctors on the same weekend into the same group', () => {
    const rows = [
      { profile_id: 'p1', name: 'A', surname: 'One', last_worked_weekend: '2026-08-01', next_weekend_type: 'days' },
      { profile_id: 'p2', name: 'B', surname: 'Two', last_worked_weekend: '2026-08-01', next_weekend_type: 'days' },
    ]
    const grouped = projectTeamWeekends(rows, { fromDate: '2026-08-01', throughDate: '2026-08-20' })
    expect(grouped).toHaveLength(1)
    expect(grouped[0].days).toHaveLength(2)
  })
})
