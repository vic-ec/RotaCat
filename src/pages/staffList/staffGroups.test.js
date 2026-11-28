import { describe, it, expect } from 'vitest'
import { buildGroups, categoryGroupKey, categoryGroupLabel, roleGroupLabel } from './staffGroups'

const p = (surname, extra = {}) => ({ id: surname, surname, role: 'doctor', category: 'MO', ...extra })
const names = group => group.items.map(x => x.surname)

describe('categoryGroupKey / labels', () => {
  it('groups locums and clerks by role, doctors by category, the rest as Other', () => {
    expect(categoryGroupKey(p('A', { role: 'locum', category: 'MO' }))).toBe('Locum')
    expect(categoryGroupKey(p('A', { role: 'clerk' }))).toBe('Clerk')
    expect(categoryGroupKey(p('A', { category: 'Registrar' }))).toBe('Registrar')
    expect(categoryGroupKey(p('A', { category: null }))).toBe('Other')
  })

  it('labels categories in full and leaves Locum / Clerk / Other as they are', () => {
    expect(categoryGroupLabel('MO')).toBe('Medical Officer')
    expect(categoryGroupLabel('Locum')).toBe('Locum')
    expect(categoryGroupLabel('Other')).toBe('Other')
    expect(categoryGroupLabel('Unheard')).toBe('Unheard')
    expect(roleGroupLabel('clerk')).toBe('Clerk')
    expect(roleGroupLabel('mystery')).toBe('mystery')
  })
})

describe('buildGroups', () => {
  const people = [
    p('Zulu', { category: 'MO' }),
    p('Adams', { category: 'Registrar' }),
    p('Moyo', { category: 'MO' }),
    p('Botha', { role: 'locum', category: 'MO' }),
    p('Khan', { role: 'clerk', category: null }),
    p('Ngema', { category: 'Mystery' }),
    p('Dube', { category: 'Consultant' }),
  ]

  it('by category: the fixed category order, unknown categories after it, surnames A–Z inside', () => {
    const groups = buildGroups(people, 'category')
    expect(groups.map(g => g.key)).toEqual(['Consultant', 'Registrar', 'MO', 'Locum', 'Clerk', 'Mystery'])
    expect(groups.map(g => g.label)).toEqual(['Consultant', 'Registrar', 'Medical Officer', 'Locum', 'Clerk', 'Mystery'])
    expect(names(groups[2])).toEqual(['Moyo', 'Zulu'])
  })

  it('by role: doctors, locums, clerks', () => {
    const groups = buildGroups(people, 'role')
    expect(groups.map(g => g.label)).toEqual(['Doctor', 'Locum', 'Clerk'])
    expect(names(groups[0])).toEqual(['Adams', 'Dube', 'Moyo', 'Ngema', 'Zulu'])
  })

  it('A–Z: one unlabelled group, either direction, without reordering the input', () => {
    const before = people.map(x => x.surname)
    const asc = buildGroups(people, 'az')
    expect(asc).toHaveLength(1)
    expect(asc[0].label).toBeNull()
    expect(names(asc[0])).toEqual(['Adams', 'Botha', 'Dube', 'Khan', 'Moyo', 'Ngema', 'Zulu'])
    expect(names(buildGroups(people, 'az', 'desc')[0])).toEqual(['Zulu', 'Ngema', 'Moyo', 'Khan', 'Dube', 'Botha', 'Adams'])
    expect(people.map(x => x.surname)).toEqual(before)
  })

  it('an empty list has no sections', () => {
    expect(buildGroups([], 'category')).toEqual([])
  })
})
