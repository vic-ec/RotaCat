import { describe, it, expect } from 'vitest'
import { summarizeWeekendPlannerBatch, formatRelativeTime } from './changeLog'

describe('summarizeWeekendPlannerBatch', () => {
  it('summarizes a pure-remove batch (a Clear) as "Cleared"', () => {
    const changes = [
      { weekend_saturday: '2026-01-03', action: 'remove' },
      { weekend_saturday: '2026-01-03', action: 'remove' },
    ]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Cleared 3 Jan 2026 (2 removed)')
  })

  it('summarizes a pure-add batch (a paste) as "Added to"', () => {
    const changes = [{ weekend_saturday: '2026-01-03', action: 'add' }]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Added to 3 Jan 2026 (1 added)')
  })

  it('summarizes a mixed batch (an overwrite paste) as "Overwrote", with both counts', () => {
    const changes = [
      { weekend_saturday: '2026-01-03', action: 'remove' },
      { weekend_saturday: '2026-01-03', action: 'add' },
      { weekend_saturday: '2026-01-03', action: 'add' },
    ]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Overwrote 3 Jan 2026 (2 added, 1 removed)')
  })

  it('collapses multiple weekends to a count rather than listing every date', () => {
    const changes = [
      { weekend_saturday: '2026-01-03', action: 'remove' },
      { weekend_saturday: '2026-01-10', action: 'remove' },
      { weekend_saturday: '2026-01-17', action: 'remove' },
    ]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Cleared 3 weekends (3 removed)')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-06T17:30:00Z')

  it('reads "just now" for anything under a minute old', () => {
    expect(formatRelativeTime('2026-08-06T17:29:45Z', now)).toBe('just now')
  })

  it('reads in minutes under an hour old', () => {
    expect(formatRelativeTime('2026-08-06T17:28:00Z', now)).toBe('2 min ago')
  })

  it('reads in hours under a day old', () => {
    expect(formatRelativeTime('2026-08-06T15:30:00Z', now)).toBe('2 hrs ago')
  })

  it('reads in singular "1 hr ago"', () => {
    expect(formatRelativeTime('2026-08-06T16:30:00Z', now)).toBe('1 hr ago')
  })

  it('reads in days once a day or older', () => {
    expect(formatRelativeTime('2026-08-04T17:30:00Z', now)).toBe('2 days ago')
  })
})
