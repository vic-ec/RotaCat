import { describe, it, expect } from 'vitest'
import { weekStart, weekBounds, buildWeekAgenda, buildPeopleLeave, peopleAwayByDate } from './teamLeaveMobile'
import { datesInMonth } from './leaveYearGrid'

function req(overrides) {
  return {
    id: 'r', profile_id: 'p', leave_type: 'annual', status: 'approved',
    date_from: '2026-08-10', date_to: '2026-08-16', profiles: { name: 'Ada', surname: 'Zulu' },
    ...overrides,
  }
}

describe('weekStart / weekBounds', () => {
  it('snaps to the Sunday of the containing week', () => {
    // 2026-08-12 is a Wednesday; the week's Sunday is 2026-08-09.
    expect(weekStart('2026-08-12')).toBe('2026-08-09')
    expect(weekBounds('2026-08-12')).toEqual({ start: '2026-08-09', end: '2026-08-15' })
  })
  it('is a no-op when the date is already a Sunday', () => {
    expect(weekStart('2026-08-09')).toBe('2026-08-09')
  })
})

describe('buildWeekAgenda', () => {
  const requests = [
    req({ id: 'now', date_from: '2026-08-05', date_to: '2026-08-16' }), // covers today (10th)
    req({ id: 'starts-wed', profile_id: 'q', date_from: '2026-08-12', date_to: '2026-08-14', profiles: { name: 'Bo', surname: 'Adams' } }),
    req({ id: 'pending-thu', profile_id: 's', status: 'pending', date_from: '2026-08-13', date_to: '2026-08-13', profiles: { name: 'Cy', surname: 'Bell' } }),
    req({ id: 'rejected', profile_id: 't', status: 'rejected', date_from: '2026-08-11', date_to: '2026-08-11' }),
    req({ id: 'next-week', profile_id: 'u', date_from: '2026-08-20', date_to: '2026-08-21' }),
  ]

  it('anchors to today and splits on-leave-now vs starting-later, once each', () => {
    const { anchor, onLeave, startingByDay } = buildWeekAgenda(requests, '2026-08-09', '2026-08-10')
    expect(anchor).toBe('2026-08-10')
    expect(onLeave.map(r => r.id)).toEqual(['now'])
    expect(startingByDay.map(g => g.date)).toEqual(['2026-08-12', '2026-08-13'])
    expect(startingByDay[1].items.map(r => r.id)).toEqual(['pending-thu'])
  })

  it('excludes rejected leave and leave outside the week', () => {
    const { onLeave, startingByDay } = buildWeekAgenda(requests, '2026-08-09', '2026-08-10')
    const allIds = [...onLeave, ...startingByDay.flatMap(g => g.items)].map(r => r.id)
    expect(allIds).not.toContain('rejected')
    expect(allIds).not.toContain('next-week')
  })

  it('anchors to the week start when browsing a week that does not contain today', () => {
    const { anchor } = buildWeekAgenda(requests, '2026-09-06', '2026-08-10')
    expect(anchor).toBe('2026-09-06')
  })
})

describe('buildPeopleLeave', () => {
  it('derives current vs next per person, preferring approved for current', () => {
    const people = buildPeopleLeave([
      req({ id: 'a', profile_id: 'p1', date_from: '2026-08-05', date_to: '2026-08-16', profiles: { name: 'Ada', surname: 'Adams' } }),
      req({ id: 'b', profile_id: 'p1', date_from: '2026-09-01', date_to: '2026-09-03', profiles: { name: 'Ada', surname: 'Adams' } }),
      req({ id: 'c', profile_id: 'p2', status: 'pending', date_from: '2026-10-01', date_to: '2026-10-02', profiles: { name: 'Bo', surname: 'Zed' } }),
    ], '2026-08-10')
    expect(people.map(p => p.doctor.surname)).toEqual(['Adams', 'Zed']) // sorted by surname
    expect(people[0].current.id).toBe('a')
    expect(people[0].next.id).toBe('b')
    expect(people[1].current).toBeNull()
    expect(people[1].next.id).toBe('c')
    expect(people[1].items).toHaveLength(1)
  })

  it('omits people whose only leave is rejected/withdrawn', () => {
    const people = buildPeopleLeave([req({ status: 'rejected' })], '2026-08-10')
    expect(people).toHaveLength(0)
  })
})

describe('peopleAwayByDate', () => {
  it('counts distinct people per day and dedups approved over pending', () => {
    const dates = datesInMonth(2026, 8)
    const map = peopleAwayByDate([
      req({ id: 'a', profile_id: 'p1', date_from: '2026-08-10', date_to: '2026-08-11' }),
      req({ id: 'b', profile_id: 'p1', status: 'pending', date_from: '2026-08-10', date_to: '2026-08-10' }), // same person+day, pending
      req({ id: 'c', profile_id: 'p2', date_from: '2026-08-11', date_to: '2026-08-11' }),
    ], dates)
    expect(map.get('2026-08-10')).toHaveLength(1) // p1 only, deduped
    expect(map.get('2026-08-10')[0].status).toBe('approved') // approved won
    expect(map.get('2026-08-11')).toHaveLength(2) // p1 + p2
    expect(map.get('2026-08-09')).toHaveLength(0)
  })
})
