import { describe, it, expect } from 'vitest'
import { minutesLate, lateByLabel, shiftHasStarted, validateLateArrival, shiftOption } from './lateArrivals'

describe('minutesLate', () => {
  it('counts minutes after the shift start', () => {
    expect(minutesLate('08:00:00', '08:25')).toBe(25)
    expect(minutesLate('12:00', '13:05')).toBe(65)
  })
  it('reads an arrival after midnight as the next day for an evening shift', () => {
    expect(minutesLate('22:00:00', '00:30')).toBe(150)
    expect(minutesLate('20:00:00', '20:00')).toBe(1440)
  })
  it('is null without both times', () => {
    expect(minutesLate('08:00', '')).toBeNull()
    expect(minutesLate(null, '08:10')).toBeNull()
  })
})

describe('lateByLabel', () => {
  it('formats minutes and hours', () => {
    expect(lateByLabel(25)).toBe('25 min')
    expect(lateByLabel(65)).toBe('1 h 05 min')
    expect(lateByLabel(null)).toBe('')
  })
})

describe('shiftHasStarted', () => {
  it('compares the shift start with now', () => {
    expect(shiftHasStarted('2026-11-24', '08:00', new Date(2026, 10, 24, 8, 0))).toBe(true)
    expect(shiftHasStarted('2026-11-24', '22:00', new Date(2026, 10, 24, 21, 59))).toBe(false)
    expect(shiftHasStarted('2026-11-23', '22:00', new Date(2026, 10, 24, 0, 30))).toBe(true)
  })
})

describe('validateLateArrival', () => {
  const option = { date: '2026-11-24', shiftStart: '08:00' }
  const now = new Date(2026, 10, 24, 15, 0)
  it('accepts an arrival after the start, up to 12 hours late', () => {
    expect(validateLateArrival({ option, arrivedAt: '08:10', now })).toBeNull()
    expect(validateLateArrival({ option, arrivedAt: '20:00', now })).toBeNull()
  })
  it('refuses an arrival before the start or more than 12 hours late', () => {
    expect(validateLateArrival({ option, arrivedAt: '07:30', now })).toMatch(/after the shift start/)
    expect(validateLateArrival({ option, arrivedAt: '08:00', now })).toMatch(/after the shift start/)
    expect(validateLateArrival({ option, arrivedAt: '20:01', now })).toMatch(/12 hours/)
  })
  it('refuses a shift that has not started, a missing person and a missing time', () => {
    expect(validateLateArrival({ option: { date: '2026-11-24', shiftStart: '22:00' }, arrivedAt: '22:10', now })).toMatch(/not started/)
    expect(validateLateArrival({ option: null, arrivedAt: '08:10', now })).toMatch(/Choose who/)
    expect(validateLateArrival({ option, arrivedAt: '', now })).toMatch(/Enter the time/)
  })
})

describe('shiftOption', () => {
  const st = { code: 'WD_08', start_time: '08:00:00' }
  const base = { id: 'e1', roster_month_id: 'm1', date: '2026-11-24', is_locum: false }

  it('describes a doctor as surname, category and shift', () => {
    const o = shiftOption({ ...base, profile_id: 'p1' }, st, { name: 'Ada', surname: 'Zephyr', category: 'MO', role: 'doctor' })
    expect(o).toMatchObject({ entryId: 'e1', profileId: 'p1', isLocum: false, shiftCode: 'WD_08', shiftStart: '08:00', locumName: null })
    expect(o.label).toBe('Zephyr · MO · 08h00')
  })

  it('describes a locum by name in brackets, with or without an account', () => {
    const named = shiftOption({ ...base, is_locum: true, locum_name: 'Dr Smith', locum_contact_id: 'c1' }, { code: 'WD_12', start_time: '12:00:00' }, null)
    expect(named.label).toBe('[ Dr Smith ] · Locum · 12h00')
    expect(named).toMatchObject({ profileId: null, locumName: 'Dr Smith', locumContactId: 'c1', isLocum: true })
    const account = shiftOption({ ...base, is_locum: true, profile_id: 'l1' }, st, { name: 'Lee', surname: 'Locum', role: 'locum' })
    expect(account.label).toBe('[ Lee Locum ] · Locum · 08h00')
    expect(account.locumName).toBeNull()
  })

  it('uses the entry\'s own start time when it was adjusted', () => {
    const o = shiftOption({ ...base, profile_id: 'p1', start_time_override: '10:00:00' }, st, { name: 'Ada', surname: 'Zephyr', category: 'MO' })
    expect(o.shiftStart).toBe('10:00')
    expect(o.label).toMatch(/10h00$/)
  })

  it('gives nothing for an open slot or a struck-through row with nobody on it', () => {
    expect(shiftOption({ ...base, is_locum: true, locum_name: null }, st, null)).toBeNull()
    expect(shiftOption({ ...base, profile_id: null, vacated_profile_id: 'p1' }, st, null)).toBeNull()
  })
})
