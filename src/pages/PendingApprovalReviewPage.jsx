import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { CircleCheck, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar from '../components/ProfileAvatar'
import SelectMenu from '../components/SelectMenu'
import { formatPhoneProgressive } from '../lib/phone'
import { DEFAULT_HOURS, DEFAULT_SWAP_GROUP, annualLeaveDaysForCategory } from '../lib/staffDefaults'

const ROLE_LABELS = { doctor: 'Doctor', locum: 'Locum', clerk: 'Clerk' }
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  COSMO:      'COSMO',
  COSMOPsych: 'COSMO (Psych)',
  Intern:     'Intern',
  Consultant: 'Consultant',
}
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))

const SAVED_FLASH_MS = 2500

function GroupLabel({ children }) {
  return <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</p>
}

// `embedded`/`onClose`: when rendered inside PendingApprovalSlideOverPanel
// (the Staff list's right-hugging panel — see that component) rather than
// as its own full-page route, the fixed BackButton doesn't make sense
// (it's positioned against the whole viewport, not the panel) and
// approve/reject/back should close the panel instead of navigating to
// /staff. Standalone use (a direct link to /staff/pending/:id) is
// unaffected — same navigate('/staff') as before.
export default function PendingApprovalReviewPage({ embedded = false, onClose }) {
  const { isAdmin } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()

  function goBack() {
    if (embedded && onClose) onClose()
    else navigate('/staff')
  }

  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('doctor')
  const [category, setCategory] = useState('')
  const [hasAdmin, setHasAdmin] = useState(false)

  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop
  }, [id, isAdmin])

  async function load() {
    setLoading(true)
    setLoadError('')
    const [{ data, error }, { data: emailRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.rpc('get_staff_emails'),
    ])
    if (error) {
      setLoadError(error.message)
      setLoading(false)
      return
    }
    setProfile(data)
    setEmail((emailRows || []).find(r => r.id === id)?.email || '')
    setFirstName(data.name || '')
    setSurname(data.surname || '')
    setPhone(data.phone || '')
    setRole(data.role || 'doctor')
    setCategory(data.category || '')
    setHasAdmin(data.is_admin === true)
    setLoading(false)
  }

  if (!isAdmin) return <Navigate to="/staff" replace />

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>

  if (loadError) {
    return (
      <div className="mx-auto max-w-7xl pb-12">
        <div className="card border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">Couldn&apos;t load this registration: {loadError}</p>
          <button onClick={goBack} className="btn-secondary mt-3">Back to Staff list</button>
        </div>
      </div>
    )
  }

  if (profile.is_approved || profile.is_rejected) {
    return (
      <div className="mx-auto max-w-7xl pb-12">
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-muted">
            This registration has already been {profile.is_approved ? 'approved' : 'rejected'}.
          </p>
          <button onClick={goBack} className="btn-secondary mt-4">Back to Staff list</button>
        </div>
      </div>
    )
  }

  const registeredDate = profile.created_at?.slice(0, 10).split('-').reverse().join('-')
  const registeredTime = profile.created_at?.slice(11, 16)
  const atAGlanceLabel = role === 'doctor'
    ? (profile.category ? (CATEGORY_LABELS[profile.category] || profile.category) : '—')
    : (ROLE_LABELS[profile.role] || profile.role)

  const dirty =
    firstName !== (profile.name || '') ||
    surname !== (profile.surname || '') ||
    phone !== (profile.phone || '') ||
    role !== (profile.role || 'doctor') ||
    category !== (profile.category || '') ||
    hasAdmin !== (profile.is_admin === true)

  function handleRoleChange(value) {
    setRole(value)
    setCategory('') // valid category set differs per role
  }

  function cancelEdits() {
    setFirstName(profile.name || '')
    setSurname(profile.surname || '')
    setPhone(profile.phone || '')
    setRole(profile.role || 'doctor')
    setCategory(profile.category || '')
    setHasAdmin(profile.is_admin === true)
    setSaveError('')
  }

  async function saveUpdate() {
    setSaving(true)
    setSaveError('')

    if (role === 'doctor' && !category) {
      setSaving(false)
      setSaveError('Select a category for a doctor account.')
      return
    }

    const { error } = await supabase.from('profiles').update({
      name: firstName,
      surname,
      phone: phone || null,
      role,
      category: role === 'doctor' ? category : null,
      is_admin: role === 'doctor' ? hasAdmin : false,
    }).eq('id', id)

    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setProfile(prev => ({
      ...prev,
      name: firstName,
      surname,
      phone: phone || null,
      role,
      category: role === 'doctor' ? category : null,
      is_admin: role === 'doctor' ? hasAdmin : false,
    }))
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), SAVED_FLASH_MS)
  }

  async function approve() {
    setActioning(true)
    const finalRole = profile.role || 'doctor'
    const rawCategory = profile.category || null
    const finalCategory =
      finalRole === 'doctor' ? rawCategory :
      finalRole === 'locum'  ? (['MO', 'Registrar'].includes(rawCategory) ? rawCategory : null) :
      null
    const isAdminFlag = finalRole === 'doctor' ? (profile.is_admin ?? false) : false
    const hours = DEFAULT_HOURS[finalCategory] || { min: 220, max: 246 }
    const swapGroup = DEFAULT_SWAP_GROUP[finalCategory] || 'junior'

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({
      is_approved: true,
      is_active: true,
      role: finalRole,
      category: finalCategory || null,
      is_admin: isAdminFlag,
      min_hours: hours.min,
      max_hours: hours.max,
      swap_group: swapGroup,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)

    setActioning(false)
    if (error) {
      alert('Could not approve account: ' + error.message)
      return
    }

    const leaveDays = annualLeaveDaysForCategory(finalCategory)
    if (leaveDays !== null) {
      await supabase.from('annual_leave_balances').upsert(
        { profile_id: id, year: new Date().getFullYear(), days_allotted: leaveDays },
        { onConflict: 'profile_id,year' }
      )
    }

    goBack()
  }

  async function reject() {
    setActioning(true)
    const { error } = await supabase.from('profiles').update({
      is_approved: false,
      is_active: false,
      is_rejected: true,
    }).eq('id', id)

    setActioning(false)
    if (error) {
      alert('Could not reject account: ' + error.message)
      return
    }
    goBack()
  }

  return (
    <div className="mx-auto max-w-7xl pb-12">
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All staff
      </button>

      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl text-ink">New User Registration for Review</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Registered {registeredDate} at {registeredTime}
          </p>
        </div>

        {/* ── Profile ──────────────────────────────────────────── */}
        <div className="card px-5 py-4">
          <div className="flex items-start gap-3">
            <ProfileAvatar profile={profile} size={48} className="mt-1 flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <label htmlFor="firstName" className="label-text">First name</label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label htmlFor="surname" className="label-text">Surname</label>
                <input
                  id="surname"
                  type="text"
                  value={surname}
                  onChange={e => setSurname(e.target.value)}
                  className="input-field"
                />
              </div>
              <span className="inline-block rounded-full bg-success-bg px-2 py-0.5 text-xs font-bold text-success">
                {atAGlanceLabel}
              </span>
            </div>
          </div>
        </div>

        {/* ── Contact details ──────────────────────────────────── */}
        <div>
          <GroupLabel>Contact Details</GroupLabel>
          <div className="card space-y-4 p-4">
            <div>
              <label htmlFor="phone" className="label-text">Mobile</label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={formatPhoneProgressive(phone)}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="(082) 123 4567"
                className="input-field"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <label className="text-sm font-medium text-ink-light">Email</label>
                {profile.email_verified && (
                  <CircleCheck title="Email verified" className="h-3.5 w-3.5 text-success" />
                )}
              </div>
              {/* Read-only — the address was verified by the user during
                  registration, so it isn't something an admin should be
                  able to silently change here. */}
              {email ? (
                <a href={`mailto:${email}`} className="block truncate rounded border border-transparent px-3 py-1 text-sm text-ink hover:underline">
                  {email}
                </a>
              ) : (
                <p className="truncate rounded border border-transparent px-3 py-1 text-sm text-ink-muted">Not set</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Security & Access ─────────────────────────────────── */}
        <div>
          <GroupLabel>Security &amp; Access</GroupLabel>
          <div className="card p-4">
            <div className="space-y-4">
              <div>
                <label className="label-text">Role</label>
                <SelectMenu value={role} onChange={handleRoleChange} options={ROLE_OPTIONS} />
              </div>
              {role === 'doctor' && (
                <div>
                  <label className="label-text">Category</label>
                  <SelectMenu
                    value={category}
                    onChange={setCategory}
                    placeholder="Select…"
                    options={CATEGORY_OPTIONS}
                  />
                </div>
              )}
              {role === 'doctor' && (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={hasAdmin}
                    onChange={e => setHasAdmin(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-line accent-accent"
                  />
                  Has admin permissions
                </label>
              )}

              <div className="flex items-center gap-3">
                <button onClick={saveUpdate} disabled={saving || !dirty} className="btn-primary">
                  {saving ? 'Saving…' : justSaved ? 'Saved.' : 'Update'}
                </button>
                {dirty && (
                  <button onClick={cancelEdits} disabled={saving} className="btn-secondary">
                    Cancel
                  </button>
                )}
                {saveError && <span className="text-xs font-medium text-flagRed">{saveError}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Approve / Reject ─────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={approve}
            disabled={actioning}
            className="flex-1 rounded bg-success px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 active:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={reject}
            disabled={actioning}
            className="flex-1 rounded border border-flagRed px-4 py-2 text-sm font-semibold text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}
