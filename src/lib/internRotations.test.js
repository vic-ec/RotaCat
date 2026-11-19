import { describe, it, expect } from 'vitest'
import {
  resolveLeaveCapacityColumn, rotationForDate, straddlesRotationBoundary, rotationBoundaryNote, groupRotationsByDoctorId,
  endOfRotationFlag, groupRotationsIntoBlocks, monthSpan, activeRotationStatus, upcomingRotationStatus, completedRotationStatus,
} from './internRotations'

const EC_ROTATION = { doctor_id: 'intern-1', rotation_type: 'EC', start_date: '2027-01-01', end_date: '2027-02-28' }
const OT_ROTATION = { doctor_id: 'intern-1', rotation_type: 'OT', start_date: '2027-03-01', end_date: '2027-04-30' }
const rotationsByDoctorId = groupRotationsByDoctorId([EC_ROTATION, OT_ROTATION])

describe('resolveLeaveCapacityColumn', () => {
  it('is a pure pass-through to columnForLeaveCategory for every non-Intern category', () => {
    expect(resolveLeaveCapacityColumn({ category: 'MO', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('MO')
    expect(resolveLeaveCapacityColumn({ category: 'Registrar', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('Registrar')
    expect(resolveLeaveCapacityColumn({ category: 'COSMO', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('EC_Intern')
    expect(resolveLeaveCapacityColumn({ category: 'Consultant', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBe('Other')
    expect(resolveLeaveCapacityColumn({ category: 'Locum', profileId: 'p1', date: '2027-01-15', rotationsByDoctorId })).toBeNull()
  })

  it('is unaffected by rotation data present for a DIFFERENT doctor', () => {
    // 'MO' category short-circuits before rotationsByDoctorId is even
    // touched — even a bogus/mismatched map must never change the answer.
    expect(resolveLeaveCapacityColumn({ category: 'MO', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId })).toBe('MO')
  })

  it('resolves an Intern to EC_Intern during their EC rotation block', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId })).toBe('EC_Intern')
  })

  it('resolves an Intern to OT_Intern during their OT rotation block', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-03-15', rotationsByDoctorId })).toBe('OT_Intern')
  })

  it('falls back to the static default (EC_Intern) when no rotation covers the date', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-06-01', rotationsByDoctorId })).toBe('EC_Intern')
  })

  it('falls back to the static default when the doctor has no rotation rows at all', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-2', date: '2027-01-15', rotationsByDoctorId })).toBe('EC_Intern')
  })

  it('resolves off the given date, not today — a past/future rotation still resolves correctly', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-02-01', rotationsByDoctorId })).toBe('EC_Intern')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-04-01', rotationsByDoctorId })).toBe('OT_Intern')
  })

  it('never throws on malformed rotationsByDoctorId, degrading to the static default', () => {
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: null })).toBe('EC_Intern')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: undefined })).toBe('EC_Intern')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: 'not-a-map' })).toBe('EC_Intern')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: undefined, date: '2027-01-15', rotationsByDoctorId })).toBe('EC_Intern')
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: undefined, rotationsByDoctorId })).toBe('EC_Intern')
  })

  it('accepts a plain object keyed by doctorId in addition to a Map', () => {
    const plainObject = { 'intern-1': [EC_ROTATION] }
    expect(resolveLeaveCapacityColumn({ category: 'Intern', profileId: 'intern-1', date: '2027-01-15', rotationsByDoctorId: plainObject })).toBe('EC_Intern')
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

describe('endOfRotationFlag', () => {
  const ENDED_ROTATION = { start_date: '2027-01-01', end_date: '2027-06-30' }

  it('flags an Intern once today reaches the 1st of the month their last block ends in', () => {
    expect(endOfRotationFlag({ category: 'Intern', rotations: [ENDED_ROTATION] }, '2027-06-01')).toEqual(ENDED_ROTATION)
    expect(endOfRotationFlag({ category: 'Intern', rotations: [ENDED_ROTATION] }, '2027-06-30')).toEqual(ENDED_ROTATION)
  })

  it('flags a Registrar the same way', () => {
    expect(endOfRotationFlag({ category: 'Registrar', rotations: [ENDED_ROTATION] }, '2027-06-15')).toEqual(ENDED_ROTATION)
  })

  it('does not flag COSMO — an OT/subtype change is a move within EC, not an exit', () => {
    expect(endOfRotationFlag({ category: 'COSMO', rotations: [ENDED_ROTATION] }, '2027-06-15')).toBeNull()
  })

  it('does not flag before the 1st of the ending month', () => {
    expect(endOfRotationFlag({ category: 'Intern', rotations: [ENDED_ROTATION] }, '2027-05-31')).toBeNull()
  })

  it('does not flag a null (ongoing) end_date', () => {
    expect(endOfRotationFlag({ category: 'Intern', rotations: [{ start_date: '2027-01-01', end_date: null }] }, '2027-12-31')).toBeNull()
  })

  it('does not flag when a later block already covers what comes next', () => {
    const next = { start_date: '2027-07-01', end_date: null }
    expect(endOfRotationFlag({ category: 'Intern', rotations: [ENDED_ROTATION, next] }, '2027-06-15')).toBeNull()
  })

  it('does not flag once an admin has already scheduled a deactivation', () => {
    expect(endOfRotationFlag({
      category: 'Intern', scheduledInactiveDate: '2027-07-01', rotations: [ENDED_ROTATION],
    }, '2027-06-15')).toBeNull()
  })

  it('does not flag a doctor with no rotation rows at all', () => {
    expect(endOfRotationFlag({ category: 'Intern', rotations: [] }, '2027-06-15')).toBeNull()
  })

  it('resolves off the block with the latest start_date, not array order', () => {
    const earlier = { start_date: '2026-10-01', end_date: '2026-12-31' }
    expect(endOfRotationFlag({ category: 'Intern', rotations: [ENDED_ROTATION, earlier] }, '2027-06-15')).toEqual(ENDED_ROTATION)
  })
})

describe('groupRotationsIntoBlocks', () => {
  it('joins rotations with no gap into one block', () => {
    const ec = { id: 'a', start_date: '2027-01-01', end_date: '2027-03-31' }
    const ot = { id: 'b', start_date: '2027-04-01', end_date: '2027-06-30' }
    const blocks = groupRotationsIntoBlocks([ot, ec]) // deliberately out of order
    expect(blocks).toEqual([{ rotations: [ec, ot], startDate: '2027-01-01', endDate: '2027-06-30' }])
  })

  it('splits into separate blocks when there is a real gap', () => {
    const first = { id: 'a', start_date: '2027-01-01', end_date: '2027-03-31' }
    const second = { id: 'b', start_date: '2027-05-01', end_date: '2027-07-31' } // gap: Apr is unassigned
    const blocks = groupRotationsIntoBlocks([first, second])
    expect(blocks).toEqual([
      { rotations: [first], startDate: '2027-01-01', endDate: '2027-03-31' },
      { rotations: [second], startDate: '2027-05-01', endDate: '2027-07-31' },
    ])
  })

  it('never continues a block past an open-ended rotation', () => {
    const open = { id: 'a', start_date: '2027-01-01', end_date: null }
    const later = { id: 'b', start_date: '2027-06-01', end_date: '2027-08-31' }
    const blocks = groupRotationsIntoBlocks([open, later])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ rotations: [open], startDate: '2027-01-01', endDate: null })
  })

  it('returns an empty list for no rotations', () => {
    expect(groupRotationsIntoBlocks([])).toEqual([])
    expect(groupRotationsIntoBlocks(undefined)).toEqual([])
  })
})

describe('monthSpan', () => {
  it('counts a single month as 1', () => {
    expect(monthSpan('2027-03-05', '2027-03-28')).toBe(1)
  })

  it('counts inclusively across months within a year', () => {
    expect(monthSpan('2027-01-01', '2027-03-31')).toBe(3)
  })

  it('counts across a year boundary', () => {
    expect(monthSpan('2027-11-01', '2028-01-31')).toBe(3)
  })
})

describe('activeRotationStatus', () => {
  it('mid-block: current rotation ends, another follows in the same block', () => {
    const current = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-09-01', end_date: '2027-11-30' }
    const next = { id: 'b', rotation_type: 'OT', subtype: 'DPM_BCH', start_date: '2027-12-01', end_date: '2028-02-29' }
    expect(activeRotationStatus([current, next], '2027-11-15')).toEqual({
      situation: 'mid-block', current, next, blockEnd: '2028-02-29',
    })
  })

  it('last rotation in a multi-rotation block', () => {
    const first = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-09-01', end_date: '2027-11-30' }
    const current = { id: 'b', rotation_type: 'OT', subtype: 'DPM_BCH', start_date: '2027-12-01', end_date: '2028-02-29' }
    expect(activeRotationStatus([first, current], '2028-01-15')).toEqual({ situation: 'last-in-block', current })
  })

  it('a single-rotation block (typical registrar)', () => {
    const current = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-11-01', end_date: '2028-01-31' }
    expect(activeRotationStatus([current], '2027-12-15')).toEqual({
      situation: 'single', current, blockStart: '2027-11-01',
    })
  })

  it('a block crossing a year end still resolves blockEnd correctly', () => {
    const current = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-10-01', end_date: '2027-12-31' }
    const next = { id: 'b', rotation_type: 'OT', subtype: 'LRCHC', start_date: '2028-01-01', end_date: '2028-02-28' }
    const status = activeRotationStatus([current, next], '2027-11-01')
    expect(status.situation).toBe('mid-block')
    expect(status.blockEnd).toBe('2028-02-28')
  })

  it('an open-ended current rotation is "ongoing", even mid-block', () => {
    const first = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-03-31' }
    const current = { id: 'b', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2027-04-01', end_date: null }
    expect(activeRotationStatus([first, current], '2027-06-01')).toEqual({ situation: 'ongoing', current })
  })

  it('between blocks: nothing current, one scheduled later', () => {
    const next = { id: 'a', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2028-03-01', end_date: null }
    expect(activeRotationStatus([next], '2028-01-15')).toEqual({ situation: 'between-blocks', next })
  })

  it('nothing scheduled at all', () => {
    expect(activeRotationStatus([], '2027-01-01')).toEqual({ situation: 'none' })
  })

  it('overlap: the rotation with the latest start_date wins, not array order', () => {
    const earlier = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-06-30' }
    const later = { id: 'b', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2027-06-01', end_date: '2027-08-31' }
    // Overlapping rotations aren't "adjacent", so they form two separate
    // one-rotation blocks here, not one two-rotation block — the point of
    // this test is just that `later` (not `earlier`) is the one picked.
    expect(activeRotationStatus([earlier, later], '2027-06-15')).toEqual({
      situation: 'single', current: later, blockStart: '2027-06-01',
    })
  })
})

describe('upcomingRotationStatus', () => {
  it('no rotations on file yet', () => {
    expect(upcomingRotationStatus([])).toEqual({ situation: 'none' })
  })

  it('a single-rotation first block', () => {
    const rotation = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-03-31' }
    expect(upcomingRotationStatus([rotation])).toEqual({ situation: 'single', rotation })
  })

  it('a multi-rotation first block, in order', () => {
    const first = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-02-28' }
    const second = { id: 'b', rotation_type: 'OT', subtype: 'DPM_BCH', start_date: '2027-03-01', end_date: '2027-04-30' }
    expect(upcomingRotationStatus([second, first])).toEqual({
      situation: 'multi', rotations: [first, second], blockEnd: '2027-04-30',
    })
  })
})

describe('completedRotationStatus', () => {
  it('no rotations on file', () => {
    expect(completedRotationStatus([])).toEqual({ situation: 'none' })
  })

  it('a single block that is itself a single rotation', () => {
    const rotation = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-03-31' }
    expect(completedRotationStatus([rotation])).toEqual({ situation: 'single-type', rotation, totalMonths: 3 })
  })

  it('several blocks total their months across all of them, not just one', () => {
    const first = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-02-28' }
    const second = { id: 'b', rotation_type: 'OT', subtype: 'LRCHC', start_date: '2027-06-01', end_date: '2027-07-31' }
    expect(completedRotationStatus([first, second])).toEqual({ situation: 'multi-block', totalMonths: 4, blockCount: 2 })
  })

  it('a single block of several rotations is also multi-block', () => {
    const first = { id: 'a', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-02-28' }
    const second = { id: 'b', rotation_type: 'OT', subtype: 'LRCHC', start_date: '2027-03-01', end_date: '2027-03-31' }
    expect(completedRotationStatus([first, second])).toEqual({ situation: 'multi-block', totalMonths: 3, blockCount: 1 })
  })
})
