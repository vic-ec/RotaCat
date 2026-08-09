import { describe, it, expect } from 'vitest'
import { buildDoctorDisplayNames } from './doctorNames'

describe('buildDoctorDisplayNames', () => {
  it('leaves a unique surname exactly as-is', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'Alice', surname: 'Anderson' },
      { id: 'p2', name: 'Bob', surname: 'Botha' },
    ])
    expect(map.get('p1')).toBe('Anderson')
    expect(map.get('p2')).toBe('Botha')
  })

  it('prefixes a first initial when 2+ doctors share a surname', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'James', surname: 'Naidoo' },
      { id: 'p2', name: 'P', surname: 'Naidoo' },
      { id: 'p3', name: 'Alice', surname: 'Anderson' },
    ])
    expect(map.get('p1')).toBe('J. Naidoo')
    expect(map.get('p2')).toBe('P. Naidoo')
    expect(map.get('p3')).toBe('Anderson') // no collision — untouched
  })

  it('falls back to the full first name only for the doctors whose initials still collide', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'James', surname: 'Naidoo' },
      { id: 'p2', name: 'Jerome', surname: 'Naidoo' }, // same initial as p1
      { id: 'p3', name: 'Priya', surname: 'Naidoo' }, // different initial — stays as "P. Naidoo"
    ])
    expect(map.get('p1')).toBe('James Naidoo')
    expect(map.get('p2')).toBe('Jerome Naidoo')
    expect(map.get('p3')).toBe('P. Naidoo')
  })

  it('is irrespective of category — every doctor sharing a surname counts, whatever category is passed in', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'James', surname: 'Naidoo', category: 'MO' },
      { id: 'p2', name: 'Priya', surname: 'Naidoo', category: 'Registrar' },
    ])
    expect(map.get('p1')).toBe('J. Naidoo')
    expect(map.get('p2')).toBe('P. Naidoo')
  })

  it('handles 3+ doctors sharing both surname and initial', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'James', surname: 'Naidoo' },
      { id: 'p2', name: 'Jerome', surname: 'Naidoo' },
      { id: 'p3', name: 'Jane', surname: 'Naidoo' },
    ])
    expect(map.get('p1')).toBe('James Naidoo')
    expect(map.get('p2')).toBe('Jerome Naidoo')
    expect(map.get('p3')).toBe('Jane Naidoo')
  })

  it('handles a missing first name gracefully', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: '', surname: 'Naidoo' },
      { id: 'p2', name: 'Priya', surname: 'Naidoo' },
    ])
    expect(map.get('p1')).toBe('Naidoo') // no initial to prefix with
    expect(map.get('p2')).toBe('P. Naidoo')
  })

  it('returns an empty map for no doctors', () => {
    expect(buildDoctorDisplayNames([]).size).toBe(0)
  })
})
