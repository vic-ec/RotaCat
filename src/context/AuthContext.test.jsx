import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// What the tests here are really protecting: auth-js owns a
// `visibilitychange` listener (it needs one to drive autoRefreshToken) and
// re-notifies subscribers with `SIGNED_IN` every time the tab is returned
// to, carrying the same user and no dedupe. Treating that as a real sign-in
// put `loading` back to true, which stops ProtectedRoute rendering its
// children — unmounting AppLayout and the whole current page, and refiring
// every query in it. So the assertions below are mostly about what does NOT
// happen on a repeat event.

let profileFetches
let authCallback
let sessionResult

const singleResult = { current: null }

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: sessionResult } }),
      onAuthStateChange: (cb) => {
        authCallback = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
    from() {
      const builder = {
        select() { return builder },
        eq(_col, val) { profileFetches.push(val); return builder },
        single() { return Promise.resolve(singleResult.current) },
      }
      return builder
    },
  },
}))

function sessionFor(id) {
  return { user: { id }, access_token: `token-for-${id}-${Math.random()}` }
}

function Probe() {
  const { profile, loading } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="profile">{profile ? profile.id : 'none'}</span>
    </div>
  )
}

async function renderProvider(initialSession) {
  sessionResult = initialSession
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
}

beforeEach(() => {
  profileFetches = []
  authCallback = null
  sessionResult = null
  singleResult.current = { data: { id: 'user-1', is_approved: true }, error: null }
})

describe('AuthProvider', () => {
  it('loads the profile for the session it starts with', async () => {
    await renderProvider(sessionFor('user-1'))

    expect(profileFetches).toEqual(['user-1'])
    expect(screen.getByTestId('profile')).toHaveTextContent('user-1')
  })

  it('ignores the SIGNED_IN auth-js re-emits on every tab refocus', async () => {
    await renderProvider(sessionFor('user-1'))
    profileFetches.length = 0

    // Three returns to the tab. Each carries a freshly deserialized session
    // object — new identity, same user.
    act(() => {
      authCallback('SIGNED_IN', sessionFor('user-1'))
      authCallback('SIGNED_IN', sessionFor('user-1'))
      authCallback('SIGNED_IN', sessionFor('user-1'))
    })

    expect(profileFetches).toEqual([])
    // The important half: `loading` never goes back up, so nothing below
    // ProtectedRoute unmounts.
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('profile')).toHaveTextContent('user-1')
  })

  it('ignores TOKEN_REFRESHED and INITIAL_SESSION for the user already loaded', async () => {
    await renderProvider(sessionFor('user-1'))
    profileFetches.length = 0

    act(() => {
      authCallback('TOKEN_REFRESHED', sessionFor('user-1'))
      authCallback('INITIAL_SESSION', sessionFor('user-1'))
    })

    expect(profileFetches).toEqual([])
  })

  it('still reloads on USER_UPDATED — the one same-user event that changes the record', async () => {
    await renderProvider(sessionFor('user-1'))
    profileFetches.length = 0

    act(() => authCallback('USER_UPDATED', sessionFor('user-1')))

    await waitFor(() => expect(profileFetches).toEqual(['user-1']))
    // Quietly: no full-screen Loading… in place of the page.
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('loads the profile when a different user signs in, holding loading across the fetch', async () => {
    await renderProvider(sessionFor('user-1'))
    profileFetches.length = 0
    singleResult.current = { data: { id: 'user-2', is_approved: true }, error: null }

    act(() => authCallback('SIGNED_IN', sessionFor('user-2')))

    // Held true across the fetch, so isApproved is never read off a null
    // profile — which would bounce an approved user through /pending.
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('user-2'))
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(profileFetches).toEqual(['user-2'])
  })

  it('clears on sign-out, and signing the same user back in loads again', async () => {
    await renderProvider(sessionFor('user-1'))
    profileFetches.length = 0

    act(() => authCallback('SIGNED_OUT', null))
    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('none'))

    act(() => authCallback('SIGNED_IN', sessionFor('user-1')))
    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('user-1'))
    expect(profileFetches).toEqual(['user-1'])
  })

  it('retries after a failed fetch rather than trusting a profile that never arrived', async () => {
    singleResult.current = { data: null, error: { message: 'network down' } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderProvider(sessionFor('user-1'))
    expect(screen.getByTestId('profile')).toHaveTextContent('none')
    profileFetches.length = 0

    singleResult.current = { data: { id: 'user-1', is_approved: true }, error: null }
    authCallback('SIGNED_IN', sessionFor('user-1'))

    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('user-1'))
    expect(profileFetches).toEqual(['user-1'])
  })
})
