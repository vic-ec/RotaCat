import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { calls, responses } = vi.hoisted(() => ({ calls: [], responses: {} }))
vi.mock('./supabase', () => ({
  supabase: {
    rpc(name) {
      calls.push(`rpc:${name}`)
      const r = responses[`rpc:${name}`]
      return typeof r === 'function' ? r() : Promise.resolve(r || { data: [], error: null })
    },
    from(table) {
      calls.push(`from:${table}`)
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(responses[`${table}:one`] || { data: null, error: null }),
      }
      return builder
    },
  },
}))

const { fetchContactCard, getCachedContactCard, prefetchContactCards, getStaffEmails, clearContactCache, CACHE_MS } = await import('./contactCard')

const EMAILS = { data: [{ id: 'p-1', email: 'm@example.test' }, { id: 'p-2', email: 'z@example.test' }], error: null }
const MAURICE = { id: 'p-1', name: 'Maurice', surname: 'Mokoena', phone: '0821234567', email_verified: true }

beforeEach(() => {
  clearContactCache()
  calls.length = 0
  for (const k of Object.keys(responses)) delete responses[k]
  responses['rpc:get_staff_emails'] = EMAILS
})
afterEach(() => vi.useRealTimers())

describe('getStaffEmails', () => {
  it('reads the list once and shares it for 5 minutes, then reads again', async () => {
    vi.useFakeTimers()
    await Promise.all([getStaffEmails(), getStaffEmails()])
    await getStaffEmails()
    expect(calls.filter(c => c === 'rpc:get_staff_emails')).toHaveLength(1)
    vi.advanceTimersByTime(CACHE_MS + 1)
    await getStaffEmails()
    expect(calls.filter(c => c === 'rpc:get_staff_emails')).toHaveLength(2)
  })

  it('does not keep a failure', async () => {
    responses['rpc:get_staff_emails'] = { data: null, error: { message: 'nope' } }
    expect(await getStaffEmails()).toBeNull()
    responses['rpc:get_staff_emails'] = EMAILS
    expect(await getStaffEmails()).toEqual(EMAILS.data)
  })
})

describe('fetchContactCard', () => {
  it('reads a profile once, then answers from memory with no further requests', async () => {
    responses['profiles:one'] = { data: MAURICE, error: null }
    const card = { name: 'Maurice Mokoena', phone: '0821234567', email: 'm@example.test', emailVerified: true }
    expect(await fetchContactCard({ profileId: 'p-1' })).toEqual(card)
    expect(calls).toEqual(['from:profiles', 'rpc:get_staff_emails'])
    expect(getCachedContactCard({ profileId: 'p-1' })).toEqual(card)
    calls.length = 0
    expect(await fetchContactCard({ profileId: 'p-1' })).toEqual(card)
    expect(calls).toEqual([])
  })

  it('reuses the shared email list for a second person', async () => {
    responses['profiles:one'] = { data: MAURICE, error: null }
    await fetchContactCard({ profileId: 'p-1' })
    responses['profiles:one'] = { data: { id: 'p-2', name: 'Zara', surname: 'Khan', phone: null, email_verified: false }, error: null }
    expect(await fetchContactCard({ profileId: 'p-2' })).toEqual({ name: 'Zara Khan', phone: null, email: 'z@example.test', emailVerified: false })
    expect(calls.filter(c => c === 'rpc:get_staff_emails')).toHaveLength(1)
  })

  it('without the email list the card has no email and is not kept', async () => {
    responses['profiles:one'] = { data: MAURICE, error: null }
    responses['rpc:get_staff_emails'] = () => Promise.reject(new Error('offline'))
    expect(await fetchContactCard({ profileId: 'p-1' })).toMatchObject({ email: null, phone: '0821234567' })
    expect(getCachedContactCard({ profileId: 'p-1' })).toBeUndefined()
  })

  it('reads a locum contact record and keeps it', async () => {
    responses['locum_contacts:one'] = { data: { id: 'c-9', name: 'Dr', surname: 'Smith', phone: '0830000000' }, error: null }
    const card = { name: 'Dr Smith', phone: '0830000000', email: null, emailVerified: false, noAccount: true }
    expect(await fetchContactCard({ contactId: 'c-9' })).toEqual(card)
    expect(getCachedContactCard({ contactId: 'c-9' })).toEqual(card)
  })

  it('returns null for nobody, and caches nothing', async () => {
    expect(await fetchContactCard({ profileId: 'gone' })).toBeNull()
    expect(getCachedContactCard({ profileId: 'gone' })).toBeUndefined()
  })
})

describe('prefetchContactCards', () => {
  it('builds cards from profile rows the board already read, with one email-list read', async () => {
    await prefetchContactCards([MAURICE, { id: 'p-2', name: 'Zara', surname: 'Khan', phone: null, email_verified: false }])
    expect(calls).toEqual(['rpc:get_staff_emails'])
    expect(getCachedContactCard({ profileId: 'p-1' })).toEqual({ name: 'Maurice Mokoena', phone: '0821234567', email: 'm@example.test', emailVerified: true })
    expect(getCachedContactCard({ profileId: 'p-2' })).toMatchObject({ email: 'z@example.test', phone: null })
  })

  it('skips rows in an older shape without phone / email_verified, so they are fetched on open', async () => {
    await prefetchContactCards([{ id: 'p-1', name: 'Maurice', surname: 'Mokoena' }])
    expect(calls).toEqual([])
    expect(getCachedContactCard({ profileId: 'p-1' })).toBeUndefined()
  })

  it('builds nothing when the email list cannot be read', async () => {
    responses['rpc:get_staff_emails'] = { data: null, error: { message: 'nope' } }
    await prefetchContactCards([MAURICE])
    expect(getCachedContactCard({ profileId: 'p-1' })).toBeUndefined()
  })

  it('cards go stale after 5 minutes', async () => {
    vi.useFakeTimers()
    await prefetchContactCards([MAURICE])
    expect(getCachedContactCard({ profileId: 'p-1' })).toBeDefined()
    vi.advanceTimersByTime(CACHE_MS + 1)
    expect(getCachedContactCard({ profileId: 'p-1' })).toBeUndefined()
  })
})
