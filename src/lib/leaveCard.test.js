import { describe, it, expect } from 'vitest'
import { leaveDateLabel, leaveDayCountLabel } from './leaveCard'

describe('leaveDateLabel', () => {
  it('formats a date as weekday, day, month — no year', () => {
    expect(leaveDateLabel('2026-08-24')).toBe('Mon 24 Aug')
    expect(leaveDateLabel('2026-12-31')).toBe('Thu 31 Dec')
  })
})

describe('leaveDayCountLabel', () => {
  it('shows calendar days plus leave days for annual leave with an entered day count', () => {
    expect(leaveDayCountLabel({
      leave_type: 'annual', date_from: '2026-08-24', date_to: '2026-08-28', annual_leave_days: 3,
    })).toBe('5 calendar days · 3 leave days')
  })

  it('handles the numeric column arriving as a string', () => {
    expect(leaveDayCountLabel({
      leave_type: 'annual', date_from: '2026-08-24', date_to: '2026-08-28', annual_leave_days: '3.0',
    })).toBe('5 calendar days · 3 leave days')
  })

  it('singularises both counts', () => {
    expect(leaveDayCountLabel({
      leave_type: 'annual', date_from: '2026-08-24', date_to: '2026-08-24', annual_leave_days: 1,
    })).toBe('1 calendar day · 1 leave day')
  })

  it('shows calendar days only for every non-annual type — there is no deducted-days field for those', () => {
    expect(leaveDayCountLabel({
      leave_type: 'study', date_from: '2026-08-24', date_to: '2026-08-26',
    })).toBe('3 calendar days')
  })

  it('shows calendar days only for a legacy annual row with no annual_leave_days', () => {
    expect(leaveDayCountLabel({
      leave_type: 'annual', date_from: '2026-08-24', date_to: '2026-08-26', annual_leave_days: null,
    })).toBe('3 calendar days')
  })
})
