import { describe, it, expect } from 'vitest'
import { splitHolidayName } from './publicHolidays'

describe('splitHolidayName', () => {
  it('splits an "(observed)" suffix off the holiday name', () => {
    expect(splitHolidayName("National Women's Day (observed)")).toEqual({
      baseName: "National Women's Day", observed: true
    })
    expect(splitHolidayName("National Women's Day")).toEqual({
      baseName: "National Women's Day", observed: false
    })
  })

  it('tolerates casing and spacing variants of the suffix', () => {
    expect(splitHolidayName('Christmas Day ( Observed )')).toEqual({
      baseName: 'Christmas Day', observed: true
    })
    expect(splitHolidayName('Day of Goodwill (OBSERVED)').observed).toBe(true)
  })

  it('leaves a name that merely mentions observation alone', () => {
    expect(splitHolidayName('Day of Reconciliation (observed nationally)')).toEqual({
      baseName: 'Day of Reconciliation (observed nationally)', observed: false
    })
  })

  it('handles a missing or blank name', () => {
    expect(splitHolidayName(undefined)).toEqual({ baseName: '', observed: false })
    expect(splitHolidayName('  ')).toEqual({ baseName: '', observed: false })
  })
})
