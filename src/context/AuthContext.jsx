import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { needsOnboarding as profileNeedsOnboarding } from '../lib/onboarding'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch the profile row that matches the logged-in auth user
  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Failed to load profile:', error.message)
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
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session?.user) {
        if (event === 'SIGNED_IN') {
          setLoading(true)
          loadProfile(session.user.id).finally(() => setLoading(false))
        } else {
          loadProfile(session.user.id)
        }
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  // Updated: accepts role and category for the new account model.
  // role defaults to 'doctor' to keep backward compatibility with any
  // existing callers that only pass email/password/name/surname.
  async function signUp(email, password, name, surname, role = 'doctor', category = null, phone = null) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
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

  // Starts an email change. Supabase mails a 6-digit code to the new
  // address, and — when the project has Secure email change on, which is
  // the default — a second one to the current address; both have to be
  // confirmed before the change takes. Callers should verify the new
  // address first, then re-check user.email and ask for the second code
  // if it hasn't moved (see WelcomePage's email step).
  async function changeEmail(newEmail) {
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    return { error }
  }

  // `email` is whichever address received the code being entered — the new
  // one, or the old one for the second half of a secure email change —
  // not always the address being moved to.
  async function verifyEmailChangeOtp(email, token) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' })
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

  // An intern or registrar who hasn't told us their rotation dates yet.
  // Gated ahead of everything else in ProtectedRoute — see /welcome.
  const needsOnboarding = profileNeedsOnboarding(profile)

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
    needsOnboarding,
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
    changeEmail,
    verifyEmailChangeOtp,
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
