import { describe, it, expect } from 'vitest'
import {
  needsOnboarding, rotationsProblem, toRotationPayload, toFormRows,
  rotationOptionsForOnboarding, ONBOARDING_ROTATION_OPTIONS,
} from './onboarding'

const INTERN = { role: 'doctor', category: 'Intern', onboarding_completed_at: null }

describe('needsOnboarding', () => {
  it('gates an intern or registrar who has not finished it', () => {
    expect(needsOnboarding(INTERN)).toBe(true)
    expect(needsOnboarding({ ...INTERN, category: 'Registrar' })).toBe(true)
  })

  it('lets everyone who has already finished it through', () => {
    expect(needsOnboarding({ ...INTERN, onboarding_completed_at: '2026-08-22T10:00:00Z' })).toBe(false)
  })

  // Nobody else has rotation dates to give, so there is nothing to ask
  // them — the flow would just be a wall.
  it('never gates a category with no rotation timeline', () => {
    for (const category of ['MO', 'Consultant', 'EC_Intern', 'OT_Intern', null]) {
      expect(needsOnboarding({ ...INTERN, category })).toBe(false)
    }
    expect(needsOnboarding({ ...INTERN, role: 'locum', category: null })).toBe(false)
    expect(needsOnboarding({ ...INTERN, role: 'clerk', category: null })).toBe(false)
  })

  it('is false with no profile loaded, rather than gating on a null', () => {
    expect(needsOnboarding(null)).toBe(false)
    expect(needsOnboarding(undefined)).toBe(false)
  })
})

describe('rotation options', () => {
  // The bare 'OT' key means "OT, subtype not assigned yet" — a state an
  // admin can leave a block in, not a placement someone would pick for
  // themselves.
  it('offers EC and the three real OT placements, never a bare OT', () => {
    expect(ONBOARDING_ROTATION_OPTIONS.map(o => o.key)).toEqual(['EC', 'OT_LRCHC', 'OT_DPM_BCH', 'OT_PSYCH'])
  })

  it('limits a registrar to EC', () => {
    expect(rotationOptionsForOnboarding('Registrar').map(o => o.key)).toEqual(['EC'])
    expect(rotationOptionsForOnboarding('Intern').length).toBe(4)
  })
})

describe('rotationsProblem', () => {
  const ok = [{ key: 'EC', startDate: '2026-09-01', endDate: '2026-10-31' }]

  it('accepts a well-formed set', () => {
    expect(rotationsProblem(ok, 'Intern')).toBeNull()
    expect(rotationsProblem([
      { key: 'EC', startDate: '2026-09-01', endDate: '2026-10-31' },
      { key: 'OT_PSYCH', startDate: '2026-11-01', endDate: '2026-12-31' },
    ], 'Intern')).toBeNull()
  })

  it('requires at least one rotation', () => {
    expect(rotationsProblem([], 'Intern')).toBe('Add at least one rotation.')
  })

  it('requires both dates on every block', () => {
    expect(rotationsProblem([{ key: 'EC', startDate: '', endDate: '2026-10-31' }], 'Intern')).toMatch(/start date/)
    expect(rotationsProblem([{ key: 'EC', startDate: '2026-09-01', endDate: '' }], 'Intern')).toMatch(/end date/)
  })

  it('rejects an end date before its start', () => {
    expect(rotationsProblem([{ key: 'EC', startDate: '2026-10-31', endDate: '2026-09-01' }], 'Intern'))
      .toMatch(/before the start date/)
  })

  // Overlapping blocks make the EC/OT answer ambiguous for the overlapping
  // dates — better refused than silently resolved by a tie-break.
  it('rejects overlapping blocks, in whatever order they were entered', () => {
    const overlapping = [
      { key: 'OT_PSYCH', startDate: '2026-10-15', endDate: '2026-12-31' },
      { key: 'EC', startDate: '2026-09-01', endDate: '2026-10-31' },
    ]
    expect(rotationsProblem(overlapping, 'Intern')).toMatch(/overlap/)
  })

  it('numbers the offending block when there is more than one', () => {
    expect(rotationsProblem([
      { key: 'EC', startDate: '2026-09-01', endDate: '2026-10-31' },
      { key: 'EC', startDate: '2026-11-01', endDate: '' },
    ], 'Intern')).toMatch(/^Rotation 2:/)
  })

  it('holds a registrar to EC', () => {
    expect(rotationsProblem([{ key: 'OT_PSYCH', startDate: '2026-09-01', endDate: '2026-10-31' }], 'Registrar'))
      .toMatch(/EC only/)
    expect(rotationsProblem(ok, 'Registrar')).toBeNull()
  })
})

describe('payload mapping', () => {
  it('splits the picked key back into rotation_type and subtype', () => {
    expect(toRotationPayload([
      { key: 'EC', startDate: '2026-09-01', endDate: '2026-10-31' },
      { key: 'OT_DPM_BCH', startDate: '2026-11-01', endDate: '2026-12-31' },
    ])).toEqual([
      { rotation_type: 'EC', subtype: null, start_date: '2026-09-01', end_date: '2026-10-31' },
      { rotation_type: 'OT', subtype: 'DPM_BCH', start_date: '2026-11-01', end_date: '2026-12-31' },
    ])
  })

  // The form replaces this person's blocks wholesale, so it has to open
  // showing whatever an admin already entered — otherwise submitting a
  // blank form would quietly delete it.
  it('round-trips existing rows back into form rows, oldest first', () => {
    expect(toFormRows([
      { rotation_type: 'OT', subtype: 'LRCHC', start_date: '2026-11-01', end_date: null },
      { rotation_type: 'EC', subtype: null, start_date: '2026-09-01', end_date: '2026-10-31' },
    ])).toEqual([
      { key: 'EC', startDate: '2026-09-01', endDate: '2026-10-31' },
      { key: 'OT_LRCHC', startDate: '2026-11-01', endDate: '' },
    ])
  })

  it('maps an OT block with no subtype back to the bare OT key', () => {
    expect(toFormRows([{ rotation_type: 'OT', subtype: null, start_date: '2026-09-01', end_date: '2026-10-31' }]))
      .toEqual([{ key: 'OT', startDate: '2026-09-01', endDate: '2026-10-31' }])
  })

  it('survives no rotations at all', () => {
    expect(toFormRows(null)).toEqual([])
    expect(toFormRows([])).toEqual([])
  })
})
