import { describe, it, expect } from 'vitest'
import * as fn from './defaults'
import * as app from '../../../src/lib/staffDefaults'

// defaults.ts is a hand-maintained mirror of src/lib/staffDefaults.js — an
// Edge Function is a separately deployed Deno bundle and cannot import
// from src/. This test is what actually keeps the two honest: an
// admin-created account has to land on exactly the same hours, swap group
// and leave allotment an approved self-registration does.
describe('edge function category defaults mirror the app', () => {
  it('has identical hours tables', () => {
    expect(fn.DEFAULT_HOURS).toEqual(app.DEFAULT_HOURS)
  })

  it('has identical swap group tables', () => {
    expect(fn.DEFAULT_SWAP_GROUP).toEqual(app.DEFAULT_SWAP_GROUP)
  })

  it('treats the same categories as ambiguous', () => {
    expect([...fn.AMBIGUOUS_CATEGORIES].sort()).toEqual([...app.AMBIGUOUS_CATEGORIES].sort())
  })

  it('resolves the same hours for every category and contract type', () => {
    const categories = [...Object.keys(app.DEFAULT_HOURS), null, 'Unknown_Category']
    for (const category of categories) {
      for (const contractType of ['full', 'five_eighths', 'Junior_Doctor_Overtime', null]) {
        expect(
          fn.defaultHoursForCategory(category, contractType),
          `${category} / ${contractType}`,
        ).toEqual(app.defaultHoursForCategory(category, contractType))
        expect(fn.defaultSwapGroupForCategory(category)).toEqual(app.defaultSwapGroupForCategory(category))
        expect(fn.annualLeaveDaysForCategory(category)).toEqual(app.annualLeaveDaysForCategory(category))
      }
    }
  })

  it('uses the same annual leave allotment', () => {
    expect(fn.ANNUAL_LEAVE_DAYS_DEFAULT).toBe(app.ANNUAL_LEAVE_DAYS_DEFAULT)
  })

  // The form offers a starting rotation for exactly the categories the
  // function will accept one for — a mismatch would either hide a field
  // that works or show one that is rejected on submit.
  it('accepts a starting rotation for the same categories the form offers one for', () => {
    expect([...fn.ROTATION_CATEGORIES].sort()).toEqual([...app.ROTATION_PLANNED_CATEGORIES].sort())
  })
})
