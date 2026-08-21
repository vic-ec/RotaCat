import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { createNotification } from './notifications'
import { todayStr } from './dateRange'
import {
  defaultHoursForCategory, defaultSwapGroupForCategory, annualLeaveDaysForCategory,
  categoryNeedsContractChoice,
} from './staffDefaults'
import { formatPhoneDisplay, formatPhoneProgressive } from './phone'

// Rotation-tracked categories only — a scheduled start/end date is meant
// for doctors whose Active/Upcoming/Completed status is actually managed
// through the Rotations page (see InternRotationsPlanner.jsx), not for
// MO/Consultant, who don't have that lifecycle.
const SCHEDULABLE_CATEGORIES = new Set(['Intern', 'Registrar', 'COSMO'])

export const ROLE_LABELS = { doctor: 'Doctor', locum: 'Locum', clerk: 'Clerk' }
export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

export const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  Intern:     'Intern',
  Consultant: 'Consultant',
}
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))

// All the state, derived values, and approve/reject logic behind reviewing
// one pending account registration — shared by the standalone
// /staff/pending/:id route (PendingApprovalReviewPage) and the Staff
// list's embedded drawer (PendingApprovalSlideOverPanel), so the two
// presentations can never drift in what they actually do, only in how
// they're framed (full page vs. drawer). `onDone` is called after a
// successful approve/reject — the standalone page navigates back to
// /staff, the embedded drawer just closes.
export function usePendingApprovalReview(id, { onDone } = {}) {
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState(null)
  // Every {id, email} row the admin can see (same RPC the Staff list's own
  // accounts grid already uses) — kept in full, not just this registrant's
  // own row, so the duplicate-email account check below is a zero-extra-
  // query cross-reference rather than a new backend call.
  const [emailRows, setEmailRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Submitted details start read-only (see AccountDetailsSection) — this
  // just reveals the same first-name/surname/mobile inputs the old
  // always-editable form had, as a deliberate opt-in rather than a
  // sitting-there-by-default risk of typing over what the registrant
  // actually submitted.
  const [editingDetails, setEditingDetails] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('doctor')
  const [category, setCategory] = useState('')
  const [contractType, setContractType] = useState('full')
  const [subtype, setSubtype] = useState(null)
  const [hasAdmin, setHasAdmin] = useState(false)
  const [activeFrom, setActiveFrom] = useState('')
  const [activeUntil, setActiveUntil] = useState('')

  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop
  }, [id])

  async function load() {
    setLoading(true)
    setLoadError('')
    const [{ data, error }, { data: emailData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.rpc('get_staff_emails'),
    ])
    if (error) {
      setLoadError(error.message)
      setLoading(false)
      return
    }
    setProfile(data)
    setEmailRows(emailData || [])
    setEmail((emailData || []).find(r => r.id === id)?.email || '')
    setFirstName(data.name || '')
    setSurname(data.surname || '')
    setPhone(data.phone || '')
    setRole(data.role || 'doctor')
    setCategory(data.category || '')
    setContractType(data.contract_type || 'full')
    setSubtype(data.psych_subcategory || null)
    setHasAdmin(data.is_admin === true)
    setLoading(false)
  }

  function handleRoleChange(value) {
    setRole(value)
    setCategory('') // valid category set differs per role
    setContractType('full')
    setSubtype(null)
    if (value !== 'doctor') setHasAdmin(false)
    setActiveFrom('')
    setActiveUntil('')
  }

  function handleCategoryChange(value) {
    setCategory(value)
    if (!SCHEDULABLE_CATEGORIES.has(value)) {
      setActiveFrom('')
      setActiveUntil('')
    }
  }

  function handleContractTypeChange(value) {
    setContractType(value)
    if (value !== 'Junior_Doctor_Overtime') setSubtype(null)
  }

  async function approve() {
    if (approveDisabledReason) return // defensive; the button is already disabled for this
    setActioning(true)

    const finalCategory = role === 'doctor' ? (category || null)
      : role === 'locum' ? (['MO', 'Registrar'].includes(category) ? category : null)
      : null
    // Falls back to the as-submitted contract_type (not the draft
    // `contractType` state) whenever the current category doesn't need a
    // choice at all — guards against a stale EC/OT pick left over from a
    // category the admin has since changed away from.
    const finalContractType = role === 'doctor' && categoryNeedsContractChoice(finalCategory)
      ? contractType
      : (profile.contract_type || 'full')
    const finalSubtype = finalContractType === 'Junior_Doctor_Overtime' ? (subtype || null) : null
    const isAdminFlag = role === 'doctor' ? hasAdmin : false
    const hours = defaultHoursForCategory(finalCategory, finalContractType)
    const swapGroup = defaultSwapGroupForCategory(finalCategory)

    // A future "Active from" starts the account inactive-but-scheduled
    // (same scheduled_active_date the Rotations page's Upcoming tab
    // manages — see InternRotationsPlanner.jsx); blank or a today-or-
    // earlier date keeps today's behavior of activating immediately.
    // "Active until" (scheduled_inactive_date) is independent of that —
    // it can be set alongside either branch, same field the end-of-
    // rotation queue schedules.
    const today = todayStr()
    const hasFutureStart = showScheduling && activeFrom && activeFrom > today
    const scheduledInactiveDate = showScheduling && activeUntil ? activeUntil : null

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({
      name: firstName,
      surname,
      phone: phone || null,
      is_approved: true,
      is_active: !hasFutureStart,
      scheduled_active_date: hasFutureStart ? activeFrom : null,
      scheduled_inactive_date: scheduledInactiveDate,
      role,
      category: finalCategory,
      contract_type: finalContractType,
      psych_subcategory: finalSubtype,
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

    onDone?.()
  }

  async function reject(reason) {
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
    // Best-effort — the rejection itself already succeeded above, so a
    // failure to notify shouldn't block navigating away or look like the
    // rejection didn't go through.
    createNotification({
      profileId: id,
      type: 'account_rejected',
      title: 'Account rejected',
      body: reason ? `Your registration was not approved. Note: ${reason}` : 'Your registration was not approved.',
    }).catch(() => {})
    onDone?.()
  }

  if (loading || loadError || !profile) {
    return { status: loading ? 'loading' : loadError ? 'error' : 'loading', loadError }
  }

  if (profile.is_approved || profile.is_rejected) {
    return { status: 'decided', decidedAs: profile.is_approved ? 'approved' : 'rejected' }
  }

  const submittedDate = profile.created_at?.slice(0, 10).split('-').reverse().join('-')
  const submittedTime = profile.created_at?.slice(11, 16)
  const fullName = `${firstName} ${surname}`.trim() || 'Unnamed registrant'
  // Reflects the CURRENT draft role/category, not the stale as-submitted
  // value — this is what the registrant will actually become, so it
  // shouldn't read as a fixed decorative badge while the admin is still
  // deciding it.
  const assignedLabel = role === 'doctor'
    ? (category ? (CATEGORY_LABELS[category] || category) : 'Category not yet selected')
    : (ROLE_LABELS[role] || role)

  const showCategory = role === 'doctor'
  const showContractType = role === 'doctor' && categoryNeedsContractChoice(category)
  const showSubtype = showContractType && contractType === 'Junior_Doctor_Overtime'
  const adminAvailable = role === 'doctor'
  const showScheduling = role === 'doctor' && SCHEDULABLE_CATEGORIES.has(category)

  const approveDisabledReason =
    role === 'doctor' && !category ? 'Select a role and clinical category to approve.'
    : showContractType && !contractType ? 'Select EC or OT hours for this category to approve.'
    : null
  const needsAdminConfirmation = adminAvailable && hasAdmin && profile.is_admin !== true

  // ── Account checks — both derived entirely from data already loaded
  // above (profile.email_verified, and the full emailRows list this load()
  // call already fetches for every staff member), so this section never
  // needs its own backend call. ──
  const duplicateEmailMatch = email
    ? emailRows.find(r => r.id !== id && r.email && r.email.toLowerCase() === email.toLowerCase())
    : null
  const accountChecks = email ? [
    {
      key: 'email-verified',
      ok: Boolean(profile.email_verified),
      label: profile.email_verified ? 'Email address is verified' : 'Email address is not yet verified',
    },
    duplicateEmailMatch
      ? {
          key: 'email-unique', ok: false,
          label: 'Possible duplicate — this email is already used by another account',
          to: `/account/${duplicateEmailMatch.id}`, linkLabel: 'Review existing account',
        }
      : { key: 'email-unique', ok: true, label: 'Email address is not used by another account' },
  ] : []

  const detailsFields = [
    editingDetails
      ? { key: 'firstName', label: 'First name', value: firstName, onChange: setFirstName }
      : { key: 'fullName', label: 'Full name', value: fullName },
    ...(editingDetails ? [{ key: 'surname', label: 'Surname', value: surname, onChange: setSurname }] : []),
    {
      key: 'mobile', label: 'Mobile',
      value: editingDetails ? formatPhoneProgressive(phone) : formatPhoneDisplay(phone),
      onChange: v => setPhone(v.replace(/\D/g, '').slice(0, 10)),
      type: 'tel', inputMode: 'numeric', placeholder: '(082) 123 4567',
    },
    { key: 'email', label: 'Email', value: email, href: email ? `mailto:${email}` : null, verified: profile.email_verified, alwaysReadOnly: true },
  ]

  return {
    status: 'ready',
    profile, fullName, assignedLabel, submittedDate, submittedTime,
    editingDetails, setEditingDetails, detailsFields,
    role, onRoleChange: handleRoleChange,
    category, onCategoryChange: handleCategoryChange,
    contractType, onContractTypeChange: handleContractTypeChange,
    subtype, onSubtypeChange: setSubtype,
    hasAdmin, onAdminChange: setHasAdmin,
    activeFrom, onActiveFromChange: setActiveFrom,
    activeUntil, onActiveUntilChange: setActiveUntil,
    showCategory, showContractType, showSubtype, adminAvailable, showScheduling,
    approveDisabledReason, needsAdminConfirmation,
    accountChecks,
    approve, reject, actioning,
  }
}
