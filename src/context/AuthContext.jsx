import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

    // Listen for login/logout events
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id)
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
  async function signUp(email, password, name, surname, role = 'doctor', category = null) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          surname,
          role,
          ...(category ? { category } : {}),
        }
      }
    })
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

  // ── Combined app permissions ─────────────────────────────────
  // Centralised here so every screen can gate on a single boolean
  // rather than reimplementing role/permission logic independently.
  const canSubmitLeave     = isDoctor && profile?.is_approved
  const canViewWeekendGrid = !isLocum   // locums cannot see weekend grid
  const canManageRoster    = isAdmin
  const canClaimShifts     = isLocum && profile?.is_approved
  const canRequestSwap     = isDoctor && profile?.is_approved

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
    // Permission helpers
    canSubmitLeave,
    canViewWeekendGrid,
    canManageRoster,
    canClaimShifts,
    canRequestSwap,
    // Auth actions
    signIn,
    signUp,
    signOut,
    refreshProfile: () => session?.user && loadProfile(session.user.id)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
