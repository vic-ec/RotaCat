import { describe, it, expect, vi, beforeEach } from 'vitest'

const { calls, responses } = vi.hoisted(() => ({ calls: [], responses: {} }))
vi.mock('./supabase', () => ({
  supabase: {
    from(table) {
      let method = 'select'
      let payload = null
      const filters = []
      const builder = {
        select() { return builder },
        insert(p) { method = 'insert'; payload = p; return builder },
        update(p) { method = 'update'; payload = p; return builder },
        eq(col, val) { filters.push([col, val]); return builder },
        is() { return builder },
        in() { return builder },
        order() { return builder },
        single() { return builder },
        then(resolve) {
          calls.push({ table, method, payload, filters })
          return Promise.resolve(responses[`${table}:${method}`] || { data: [], error: null }).then(resolve)
        },
      }
      return builder
    },
  },
}))

import { coverPatch, coverProfileId, linkLocumPlaceholder, fetchPlaceholderShiftCounts, fetchOpenLocumPlaceholders } from './locumCover'

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(responses)) delete responses[k]
})

describe('coverPatch', () => {
  it('a doctor: a plain assignment, clearing any locum fields left on the slot', () => {
    expect(coverPatch({ kind: 'doctor', id: 'doc-1' })).toMatchObject({
      profile_id: 'doc-1', is_locum: false, locum_name: null, locum_placeholder_id: null, is_manual_override: true,
    })
    expect(coverPatch({ kind: 'doctor', id: 'doc-1' })).not.toHaveProperty('counts_toward_contract_hours')
  })

  it('a locum with an account: linked to it, named, and off contract hours', () => {
    expect(coverPatch({ kind: 'locum', id: 'loc-1', name: 'Zinhle Cebani' })).toMatchObject({
      profile_id: 'loc-1', is_locum: true, locum_name: 'Zinhle Cebani', locum_placeholder_id: null, counts_toward_contract_hours: false,
    })
  })

  it('a locum with no account: named, tied to the placeholder, no profile', () => {
    const cover = { kind: 'placeholder', id: 'ph-1', name: 'Tom Temp' }
    expect(coverPatch(cover)).toMatchObject({
      profile_id: null, is_locum: true, locum_name: 'Tom Temp', locum_placeholder_id: 'ph-1', counts_toward_contract_hours: false,
    })
    expect(coverProfileId(cover)).toBeNull()
    expect(coverProfileId({ kind: 'locum', id: 'loc-1' })).toBe('loc-1')
  })
})

describe('linkLocumPlaceholder', () => {
  it('moves the placeholder\'s shifts onto the new account, then marks it linked', async () => {
    await linkLocumPlaceholder({ placeholderId: 'ph-1', profileId: 'loc-9' })
    expect(calls[0]).toMatchObject({
      table: 'roster_entries', method: 'update',
      payload: { profile_id: 'loc-9', locum_placeholder_id: null }, filters: [['locum_placeholder_id', 'ph-1']],
    })
    expect(calls[1]).toMatchObject({ table: 'locum_placeholders', method: 'update', filters: [['id', 'ph-1']] })
    expect(calls[1].payload.linked_profile_id).toBe('loc-9')
  })

  it('leaves the placeholder unlinked when the shifts could not be moved', async () => {
    responses['roster_entries:update'] = { data: null, error: { message: 'denied' } }
    await expect(linkLocumPlaceholder({ placeholderId: 'ph-1', profileId: 'loc-9' })).rejects.toThrow('denied')
    expect(calls.some(c => c.table === 'locum_placeholders')).toBe(false)
  })
})

describe('placeholder reads', () => {
  it('counts shifts per placeholder', async () => {
    responses['roster_entries:select'] = { data: [{ locum_placeholder_id: 'ph-1' }, { locum_placeholder_id: 'ph-1' }, { locum_placeholder_id: 'ph-2' }], error: null }
    const counts = await fetchPlaceholderShiftCounts(['ph-1', 'ph-2'])
    expect(counts.get('ph-1')).toBe(2)
    expect(counts.get('ph-2')).toBe(1)
  })

  it('an unreadable placeholder list is just empty (a non-admin viewer)', async () => {
    responses['locum_placeholders:select'] = { data: null, error: { message: 'rls' } }
    expect(await fetchOpenLocumPlaceholders()).toEqual([])
  })
})
