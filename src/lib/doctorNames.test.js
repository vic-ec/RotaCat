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
      { id: 'p1', name: 'James', surname: 'Nolan' },
      { id: 'p2', name: 'P', surname: 'Nolan' },
      { id: 'p3', name: 'Alice', surname: 'Anderson' },
    ])
    expect(map.get('p1')).toBe('J. Nolan')
    expect(map.get('p2')).toBe('P. Nolan')
    expect(map.get('p3')).toBe('Anderson') // no collision — untouched
  })

  it('falls back to the full first name only for the doctors whose initials still collide', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'James', surname: 'Nolan' },
      { id: 'p2', name: 'Jerome', surname: 'Nolan' }, // same initial as p1
      { id: 'p3', name: 'Priya', surname: 'Nolan' }, // different initial — stays as "P. Nolan"
    ])
    expect(map.get('p1')).toBe('James Nolan')
    expect(map.get('p2')).toBe('Jerome Nolan')
    expect(map.get('p3')).toBe('P. Nolan')
  })

  it('is irrespective of category — every doctor sharing a surname counts, whatever category is passed in', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'James', surname: 'Nolan', category: 'MO' },
      { id: 'p2', name: 'Priya', surname: 'Nolan', category: 'Registrar' },
    ])
    expect(map.get('p1')).toBe('J. Nolan')
    expect(map.get('p2')).toBe('P. Nolan')
  })

  it('handles 3+ doctors sharing both surname and initial', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: 'James', surname: 'Nolan' },
      { id: 'p2', name: 'Jerome', surname: 'Nolan' },
      { id: 'p3', name: 'Jane', surname: 'Nolan' },
    ])
    expect(map.get('p1')).toBe('James Nolan')
    expect(map.get('p2')).toBe('Jerome Nolan')
    expect(map.get('p3')).toBe('Jane Nolan')
  })

  it('handles a missing first name gracefully', () => {
    const map = buildDoctorDisplayNames([
      { id: 'p1', name: '', surname: 'Nolan' },
      { id: 'p2', name: 'Priya', surname: 'Nolan' },
    ])
    expect(map.get('p1')).toBe('Nolan') // no initial to prefix with
    expect(map.get('p2')).toBe('P. Nolan')
  })

  it('returns an empty map for no doctors', () => {
    expect(buildDoctorDisplayNames([]).size).toBe(0)
  })
})
