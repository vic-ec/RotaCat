import { describe, it, expect } from 'vitest'
import { groupWhosAway, whosAwayWhen } from './whosAway'

const TODAY = '2026-11-24'
const lr = (id, from, to, extra = {}) => ({ id, date_from: from, date_to: to, status: 'approved', leave_type: 'annual', profiles: { name: 'A', surname: id }, ...extra })
const keys = groups => Object.fromEntries(groups.map(g => [g.key, g.items.map(i => i.id)]))

describe('groupWhosAway', () => {
  it('splits approved leave into today, next 7 days, next 2 weeks and later', () => {
    const groups = groupWhosAway([
      lr('today', '2026-11-20', '2026-11-24'),
      lr('tomorrow', '2026-11-25', '2026-11-25'),
      lr('day7', '2026-12-01', '2026-12-02'),
      lr('day8', '2026-12-02', '2026-12-03'),
      lr('day14', '2026-12-08', '2026-12-08'),
      lr('day15', '2026-12-09', '2026-12-10'),
    ], TODAY)
    expect(keys(groups)).toEqual({ today: ['today'], next7: ['tomorrow', 'day7'], next14: ['day8', 'day14'], later: ['day15'] })
  })

  it('leaves out pending, rejected, cancelled and ended leave', () => {
    const groups = groupWhosAway([
      lr('pending', '2026-11-25', '2026-11-26', { status: 'pending' }),
      lr('rejected', '2026-11-25', '2026-11-26', { status: 'rejected' }),
      lr('cancelled', '2026-11-25', '2026-11-26', { status: 'cancelled' }),
      lr('ended', '2026-11-20', '2026-11-23'),
    ], TODAY)
    expect(groups.every(g => g.items.length === 0)).toBe(true)
  })

  it('keeps a doctor in each group one of their absences falls in', () => {
    const groups = groupWhosAway([
      lr('Same', '2026-11-24', '2026-11-24', { id: 'sick', leave_type: 'sick' }),
      lr('Same', '2026-11-28', '2026-11-30', { id: 'annual' }),
    ], TODAY)
    expect(keys(groups).today).toEqual(['sick'])
    expect(keys(groups).next7).toEqual(['annual'])
  })
})

describe('whosAwayWhen', () => {
  it('says when someone away today is back', () => {
    expect(whosAwayWhen(lr('x', '2026-11-21', '2026-11-29'), 'today')).toBe('back Mon 30 Nov')
  })
  it('gives later leave its dates and length', () => {
    expect(whosAwayWhen(lr('x', '2026-12-07', '2026-12-11'), 'next14')).toBe('7–11 Dec · 5 days')
    expect(whosAwayWhen(lr('x', '2026-11-25', '2026-11-25'), 'next7')).toBe('25 Nov · 1 day')
  })
})
