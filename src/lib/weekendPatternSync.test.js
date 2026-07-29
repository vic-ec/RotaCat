import { describe, it, expect } from 'vitest'
import { computeLatestWeekendByProfile } from './weekendPatternSync'

const CODES = { st_days: 'WE_08', st_flex: 'WE_13', st_nights: 'WE_20', st_weekday: 'WD_08' }

describe('computeLatestWeekendByProfile', () => {
  it('keys a Saturday days shift by its own date', () => {
    const entries = [{ profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st_days' }] // Saturday
    const latest = computeLatestWeekendByProfile(entries, CODES)
    expect(latest.get('p1')).toEqual({ saturday: '2026-08-01', type: 'days' })
  })

  it('folds a Sunday night shift back to its Saturday', () => {
    const entries = [{ profile_id: 'p1', date: '2026-08-02', shift_type_id: 'st_nights' }] // Sunday
    const latest = computeLatestWeekendByProfile(entries, CODES)
    expect(latest.get('p1')).toEqual({ saturday: '2026-08-01', type: 'nights' })
  })

  it('keeps only the most recent weekend per profile', () => {
    const entries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st_days' },
      { profile_id: 'p1', date: '2026-08-15', shift_type_id: 'st_nights' },
    ]
    const latest = computeLatestWeekendByProfile(entries, CODES)
    expect(latest.get('p1')).toEqual({ saturday: '2026-08-15', type: 'nights' })
  })

  it('ignores weekday shifts and unassigned entries', () => {
    const entries = [
      { profile_id: null, date: '2026-08-01', shift_type_id: 'st_days' },
      { profile_id: 'p1', date: '2026-08-03', shift_type_id: 'st_weekday' },
    ]
    const latest = computeLatestWeekendByProfile(entries, CODES)
    expect(latest.size).toBe(0)
  })

  it('tracks multiple profiles independently', () => {
    const entries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st_days' },
      { profile_id: 'p2', date: '2026-08-08', shift_type_id: 'st_flex' },
    ]
    const latest = computeLatestWeekendByProfile(entries, CODES)
    expect(latest.get('p1')).toEqual({ saturday: '2026-08-01', type: 'days' })
    expect(latest.get('p2')).toEqual({ saturday: '2026-08-08', type: 'days' })
  })
})
