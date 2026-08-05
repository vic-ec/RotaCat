import { describe, it, expect } from 'vitest'
import {
  resolveLeaveCapacityColumn, rotationForDate, straddlesRotationBoundary, rotationBoundaryNote, groupRotationsByDoctorId,
} from './internRotations'

const EC_ROTATION = { doctor_id: 'intern-1', rotation_type: 'EC', start_date: '2027-01-01', end_date: '2027-02-28' }
const OT_ROTATION = { doctor_id: 'intern-1', rotation_type: 'OT', start_date: '2027-03-01', end_date: '2027-04-30' }
const rotationsByDoctorId = groupRotationsByDoctorId([EC_ROTATION, OT_ROTATION])

describe('resolveLeaveCapacityColumn', () => {
  it('is a pure pass-through to columnForLeaveCategory for every non-Intern category', () => {
    expect(resolveLeaveCapacityColumn({ category: 'MO', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('MO')
    expect(resolveLeaveCapacityColumn({ category: 'Registrar', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('Registrar')
    expect(resolveLeaveCapacityColumn({ category: 'COSMO', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('EC_COSMO')
    expect(resolveLeaveCapacityColumn({ category: 'Consultant', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('Other')
    expect(resolveLeaveCapacityColumn({ category: 'Locum', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBeNull()
  })

  it('is unaffected by rotation data present for a DIFFERENT doctor', () => {
    // 'MO' category short-circuits before rotationsByDoctorId is even
    // touched — even a bogus/mismatched map must never change the answer.
    expect(resolveLeaveCapacityColumn({ category: 'MO', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId })).toBe('MO')
  })

  it('resolves an Intern to EC_COSMO during their EC rotation block', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId })).toBe('EC_COSMO')
  })

  it('resolves an Intern to OT_COSMO during their OT rotation block', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-03-15', rotationsByDoctorId })).toBe('OT_COSMO')
  })

  it('falls back to the static default (EC_COSMO) when no rotation covers the date', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-06-01', rotationsByDoctorId })).toBe('EC_COSMO')
  })

  it('falls back to the static default when the doctor has no rotation rows at all', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-2', date: '2027-01-15', rotationsByDoctorId })).toBe('EC_COSMO')
  })

  it('resolves off the given date, not today — a past/future rotation still resolves correctly', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-02-01', rotationsByDoctorId })).toBe('EC_COSMO')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-04-01', rotationsByDoctorId })).toBe('OT_COSMO')
  })

  it('never throws on malformed rotationsByDoctorId, degrading to the static default', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: null })).toBe('EC_COSMO')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: undefined })).toBe('EC_COSMO')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: 'not-a-map' })).toBe('EC_COSMO')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: undefined, date: '2027-01-15', rotationsByDoctorId })).toBe('EC_COSMO')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: undefined, rotationsByDoctorId })).toBe('EC_COSMO')
  })

  it('accepts a plain object keyed by doctorId in addition to a Map', () => {
    const plainObject = { 'intern-1': [EC_ROTATION] }
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: plainObject })).toBe('EC_COSMO')
  })
})

describe('rotationForDate', () => {
  it('finds the block covering a date', () => {
    expect(rotationForDate([EC_ROTATION, OT_ROTATION], '2027-01-15')).toBe(EC_ROTATION)
    expect(rotationForDate([EC_ROTATION, OT_ROTATION], '2027-03-15')).toBe(OT_ROTATION)
  })

  it('returns null when nothing covers the date', () => {
    expect(rotationForDate([EC_ROTATION, OT_ROTATION], '2027-06-01')).toBeNull()
  })

  it('returns null gracefully for missing rotations or date', () => {
    expect(rotationForDate(null, '2027-01-15')).toBeNull()
    expect(rotationForDate([EC_ROTATION], null)).toBeNull()
  })
})

describe('straddlesRotationBoundary / rotationBoundaryNote', () => {
  it('does not straddle when the whole range sits inside one block', () => {
    expect(straddlesRotationBoundary([EC_ROTATION, OT_ROTATION], '2027-01-10', '2027-01-20')).toBe(false)
    expect(rotationBoundaryNote([EC_ROTATION, OT_ROTATION], '2027-01-10', '2027-01-20')).toBeNull()
  })

  it('straddles when dateTo extends past the current rotation covering dateFrom', () => {
    expect(straddlesRotationBoundary([EC_ROTATION, OT_ROTATION], '2027-02-20', '2027-03-05')).toBe(true)
    const note = rotationBoundaryNote([EC_ROTATION, OT_ROTATION], '2027-02-20', '2027-03-05')
    expect(note).toMatch(/next rotation/)
    expect(note).toMatch('2027-03-01')
  })

  it('notes an open-ended straddle when no next rotation is on record yet', () => {
    const note = rotationBoundaryNote([EC_ROTATION], '2027-02-20', '2027-03-05')
    expect(note).toMatch(/no rotation is assigned yet/)
  })

  it('does not straddle when dateFrom has no current rotation at all', () => {
    expect(straddlesRotationBoundary([EC_ROTATION, OT_ROTATION], '2027-06-01', '2027-07-01')).toBe(false)
  })
})

describe('groupRotationsByDoctorId', () => {
  it('groups rows by doctor_id', () => {
    const map = groupRotationsByDoctorId([EC_ROTATION, OT_ROTATION, { ...EC_ROTATION, doctor_id: 'intern-2' }])
    expect(map.get('intern-1')).toEqual([EC_ROTATION, OT_ROTATION])
    expect(map.get('intern-2')).toHaveLength(1)
  })

  it('returns an empty map for no rows', () => {
    expect(groupRotationsByDoctorId([]).size).toBe(0)
    expect(groupRotationsByDoctorId(undefined).size).toBe(0)
  })
})
