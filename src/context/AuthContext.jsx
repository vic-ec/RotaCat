import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Whose profile we hold, or have a fetch in flight for. A ref rather than
  // state because the auth listener below is registered once and would
  // otherwise close over `profile` as it was on first render — null, forever.
  const loadedProfileUserId = useRef(null)

  // Fetch the profile row that matches the logged-in auth user
  async function loadProfile(userId) {
    // Claimed before awaiting, so a second caller arriving mid-flight sees
    // the fetch is already covered rather than starting its own.
    loadedProfileUserId.current = userId
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Failed to load profile:', error.message)
      // Released, so the next event retries instead of trusting a profile
      // that never arrived.
      loadedProfileUserId.current = null
      setProfile(null)
      return
    }
    setProfile(data)
  }

  useEffect(() => {
    // Get the current session on first load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Listen for login/logout events. A fresh SIGNED_IN needs `loading` held
    // true across the profile fetch too — otherwise `isApproved` reads as
    // false for the instant the profile is still null (not yet "confirmed
    // not approved", just unloaded), which briefly bounces an approved user
    // through the pending-approval page before the real profile lands.
    // Routine events (token refresh, etc.) already have a correct profile
    // loaded, so they refresh it quietly in the background instead.
    //
    // The guard below is what makes that description true. auth-js registers
    // its own `visibilitychange` listener (it has to, to drive
    // autoRefreshToken) and on every return to the tab it re-reads the stored
    // session and notifies subscribers — with `SIGNED_IN`, not
    // `TOKEN_REFRESHED`, and with no dedupe, even when nothing expired. That
    // took the branch above: `loading` back to true, which stops
    // ProtectedRoute rendering its children, which unmounts AppLayout and the
    // whole current page and re-runs every effect in it on the way back. Up
    // to ~20 queries per refocus on the roster grid, times each open tab,
    // for a session that had not changed. So: same user, nothing to do.
    // USER_UPDATED is the one same-user event that genuinely changes the
    // record, and it still reloads quietly.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      const userId = session?.user?.id ?? null
      if (!userId) {
        loadedProfileUserId.current = null
        setProfile(null)
        return
      }
      if (userId === loadedProfileUserId.current && event !== 'USER_UPDATED') return
      if (event === 'SIGNED_IN') {
        setLoading(true)
        loadProfile(userId).finally(() => setLoading(false))
      } else {
        loadProfile(userId)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // captchaToken is required once CAPTCHA protection is enabled on the
  // Supabase project's Auth settings — see TurnstileWidget.jsx.
  async function signIn(email, password, captchaToken) {
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
    return { error }
  }

  // Updated: accepts role and category for the new account model.
  // role defaults to 'doctor' to keep backward compatibility with any
  // existing callers that only pass email/password/name/surname.
  async function signUp(email, password, name, surname, role = 'doctor', category = null, phone = null, captchaToken) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: {
          name,
          surname,
          role,
          ...(category ? { category } : {}),
          ...(phone ? { phone } : {}),
        }
      }
    })
    return { error }
  }

  // Confirms a signup using the 6-digit code from the "Confirm signup" email
  // instead of following its link — sidesteps email providers/relays that
  // prefetch links (which silently burns the link's single-use token before
  // the person ever clicks it, see Supabase's own OTP-verification-failures
  // troubleshooting doc).
  async function verifySignupOtp(email, token) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    return { error }
  }

  async function resendSignupOtp(email) {
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  // ── Role helpers (account type: doctor / locum / clerk) ────
  const role     = profile?.role ?? null
  const isDoctor = role === 'doctor'
  const isLocum  = role === 'locum'
  const isClerk  = role === 'clerk'

  // ── Permission helpers ───────────────────────────────────────
  const isAdmin      = profile?.is_admin === true
  const isSuperAdmin = profile?.is_super_admin === true

  // Still signed in with a password an admin generated (initial
  // admin-created account, or a "Regenerate password" since). Gates every
  // authenticated route behind /set-password until they choose their own —
  // see ProtectedRoute. Deliberately separate from isApproved: that one
  // asks whether an admin has vetted this person at all, and is already
  // settled (and stays settled) for an admin-created account.
  const mustChangePassword = profile?.must_change_password === true

  // ── Combined app permissions ─────────────────────────────────
  // Centralised here so every screen can gate on a single boolean
  // rather than reimplementing role/permission logic independently.
  const canSubmitLeave     = isDoctor && profile?.is_approved
  const canViewWeekendGrid = !isLocum   // locums cannot see weekend grid
  const canManageRoster    = isAdmin
  const canClaimShifts     = isLocum && profile?.is_approved
  const canRequestSwap     = isDoctor && profile?.is_approved
  // Read-only Staff list access (contact list): every approved account,
  // regardless of role or doctor category — admins get full read/write
  // access to it separately (see StaffListPage's isAdmin-gated controls).
  const canViewStaffList = true

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    // Role booleans (account type)
    role,
    isDoctor,
    isLocum,
    isClerk,
    // Permission booleans
    isAdmin,
    isSuperAdmin,
    isApproved: profile?.is_approved === true,
    mustChangePassword,
    // Permission helpers
    canSubmitLeave,
    canViewWeekendGrid,
    canManageRoster,
    canClaimShifts,
    canRequestSwap,
    canViewStaffList,
    // Auth actions
    signIn,
    signUp,
    verifySignupOtp,
    resendSignupOtp,
    signOut,
    refreshProfile: () => session?.user && loadProfile(session.user.id)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is co-located with its provider deliberately; splitting it out would mean updating every importer for a DX-only warning
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
