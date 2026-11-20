import { describe, it, expect } from 'vitest'
import { allSectionsCollapsed } from './collapsibleSections'

describe('allSectionsCollapsed', () => {
  const sections = [{ key: 'a' }, { key: 'b' }]

  it('is false with no sections on screen', () => {
    expect(allSectionsCollapsed([], {})).toBe(false)
  })
  it('is false while any section is open', () => {
    expect(allSectionsCollapsed(sections, { a: true })).toBe(false)
    expect(allSectionsCollapsed(sections, { a: true, b: false })).toBe(false)
  })
  it('is true once every section is folded', () => {
    expect(allSectionsCollapsed(sections, { a: true, b: true })).toBe(true)
  })
  it('ignores folded state for sections not on screen', () => {
    expect(allSectionsCollapsed([{ key: 'a' }], { a: true, gone: false })).toBe(true)
  })
  it('tolerates a missing collapsed map', () => {
    expect(allSectionsCollapsed(sections, undefined)).toBe(false)
  })
})
