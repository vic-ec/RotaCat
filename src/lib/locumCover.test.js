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

import {
  coverPatch, coverProfileId, linkLocumContact, fetchContactShiftCounts, fetchOpenLocumContacts,
  locumLabel, locumDisplayName, isOpenLocumSlot, OPEN_SLOT_PATCH, phoneKey, findByPhone, locumInviteText,
} from './locumCover'

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(responses)) delete responses[k]
})

describe('coverPatch', () => {
  it('a doctor: a plain assignment, clearing any locum fields left on the slot', () => {
    expect(coverPatch({ kind: 'doctor', id: 'doc-1' })).toMatchObject({
      profile_id: 'doc-1', is_locum: false, locum_name: null, locum_contact_id: null, is_manual_override: true,
    })
    expect(coverPatch({ kind: 'doctor', id: 'doc-1' })).not.toHaveProperty('counts_toward_contract_hours')
  })

  it('a locum with an account: linked to it, named, and off contract hours', () => {
    expect(coverPatch({ kind: 'locum', id: 'loc-1', name: 'Jo Marsh', surname: 'Marsh' })).toMatchObject({
      profile_id: 'loc-1', is_locum: true, locum_name: '[Marsh]', locum_contact_id: null, counts_toward_contract_hours: false,
    })
  })

  it('a locum with no account: named, tied to the contact, no profile', () => {
    const cover = { kind: 'contact', id: 'ph-1', name: 'Tom Temp', surname: 'Temp' }
    expect(coverPatch(cover)).toMatchObject({
      profile_id: null, is_locum: true, locum_name: '[Temp]', locum_contact_id: 'ph-1', counts_toward_contract_hours: false,
    })
    expect(coverProfileId(cover)).toBeNull()
    expect(coverProfileId({ kind: 'locum', id: 'loc-1' })).toBe('loc-1')
  })
})

describe('linkLocumContact', () => {
  it('moves the contact\'s shifts onto the new account, then marks it linked', async () => {
    await linkLocumContact({ contactId: 'ph-1', profileId: 'loc-9' })
    expect(calls[0]).toMatchObject({
      table: 'roster_entries', method: 'update',
      payload: { profile_id: 'loc-9', locum_contact_id: null }, filters: [['locum_contact_id', 'ph-1']],
    })
    expect(calls[1]).toMatchObject({ table: 'locum_contacts', method: 'update', filters: [['id', 'ph-1']] })
    expect(calls[1].payload.linked_profile_id).toBe('loc-9')
  })

  it('leaves the contact unlinked when the shifts could not be moved', async () => {
    responses['roster_entries:update'] = { data: null, error: { message: 'denied' } }
    await expect(linkLocumContact({ contactId: 'ph-1', profileId: 'loc-9' })).rejects.toThrow('denied')
    expect(calls.some(c => c.table === 'locum_contacts')).toBe(false)
  })
})

describe('contact reads', () => {
  it('counts shifts per contact', async () => {
    responses['roster_entries:select'] = { data: [{ locum_contact_id: 'ph-1' }, { locum_contact_id: 'ph-1' }, { locum_contact_id: 'ph-2' }], error: null }
    const counts = await fetchContactShiftCounts(['ph-1', 'ph-2'])
    expect(counts.get('ph-1')).toBe(2)
    expect(counts.get('ph-2')).toBe(1)
  })

  it('an unreadable contact list is just empty (a non-admin viewer)', async () => {
    responses['locum_contacts:select'] = { data: null, error: { message: 'rls' } }
    expect(await fetchOpenLocumContacts()).toEqual([])
  })
})

describe('locum slot labels', () => {
  it('a filled slot is "[Surname]", an open one "[ ]"', () => {
    expect(locumLabel({ name: 'Jo Marsh', surname: 'Marsh' })).toBe('[Marsh]')
    // No separate surname: the last word of the full name.
    expect(locumLabel({ name: 'Jo van Marsh' })).toBe('[Marsh]')
    expect(locumLabel({})).toBe('[ ]')
    expect(locumDisplayName('[Marsh]')).toBe('Marsh')
    expect(locumDisplayName('[ ]')).toBe('')
    expect(locumDisplayName(null)).toBe('')
  })

  it('only a locum slot with nobody in the brackets is open', () => {
    expect(isOpenLocumSlot({ is_locum: true, profile_id: null, locum_name: '[ ]' })).toBe(true)
    expect(isOpenLocumSlot({ is_locum: true, profile_id: null, locum_name: null })).toBe(true)
    expect(isOpenLocumSlot({ is_locum: true, profile_id: null, locum_name: '[Marsh]' })).toBe(false)
    expect(isOpenLocumSlot({ is_locum: true, profile_id: 'loc-1', locum_name: '[Marsh]' })).toBe(false)
    expect(isOpenLocumSlot({ is_locum: false, profile_id: null })).toBe(false)
  })

  it('opening a shift leaves an open locum slot', () => {
    expect(OPEN_SLOT_PATCH).toMatchObject({ profile_id: null, is_locum: true, locum_name: '[ ]', locum_contact_id: null })
    expect(isOpenLocumSlot(OPEN_SLOT_PATCH)).toBe(true)
  })
})

describe('matching on mobile number', () => {
  it('treats local, spaced and international forms of one number as equal', () => {
    expect(phoneKey('0821234567')).toBe('821234567')
    expect(phoneKey('082 123 4567')).toBe('821234567')
    expect(phoneKey('+27 82 123 4567')).toBe('821234567')
    expect(phoneKey('12345')).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })

  it('finds the row with the same number, and nothing for a missing or different one', () => {
    const rows = [{ id: 'a', phone: '0821234567' }, { id: 'b', phone: '0839998888' }]
    expect(findByPhone(rows, '+27821234567')).toEqual(rows[0])
    expect(findByPhone(rows, '0820000000')).toBeNull()
    expect(findByPhone(rows, '')).toBeNull()
    expect(findByPhone([{ id: 'c', phone: null }], null)).toBeNull()
  })

  it('the invite is short, asks them to sign up with this mobile number, and ends on the link', () => {
    expect(locumInviteText({ name: 'Jo', signupUrl: 'https://app.example/signup' })).toBe(
      'Hi Jo.\n\n'
      + "You've been rostered for a shift at Victoria Hospital Emergency Centre. "
      + 'Please can you create a locum doctor account on our roster scheduling platform, RotaCat. '
      + 'Use this mobile number when signing up so your shift links to your account.\n\n'
      + 'Thank you!\n\n'
      + 'https://app.example/signup'
    )
  })

  it('more than one shift is worded in the plural', () => {
    const text = locumInviteText({ name: 'Jo', signupUrl: 'https://app.example/signup', shiftCount: 3 })
    expect(text).toContain('rostered for shifts at')
    expect(text).toContain('so your shifts link to your account')
  })
})
