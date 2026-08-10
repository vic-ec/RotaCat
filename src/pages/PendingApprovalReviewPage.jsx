import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { createNotification } from '../lib/notifications'
import AccountIdentityHeader from '../components/AccountIdentityHeader'
import AccountDetailsSection from '../components/AccountDetailsSection'
import RoleAndAccessSection from '../components/RoleAndAccessSection'
import AccountChecks from '../components/AccountChecks'
import AccountActionFooter from '../components/AccountActionFooter'
import Tag from '../components/Tag'
import { formatPhoneDisplay, formatPhoneProgressive } from '../lib/phone'
import {
  defaultHoursForCategory, defaultSwapGroupForCategory, annualLeaveDaysForCategory,
  categoryNeedsContractChoice,
} from '../lib/staffDefaults'

const ROLE_LABELS = { doctor: 'Doctor', locum: 'Locum', clerk: 'Clerk' }
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  Intern:     'Intern',
  Consultant: 'Consultant',
}
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))

// `embedded`/`onClose`: when rendered inside PendingApprovalSlideOverPanel
// (the Staff list's right-hugging panel — see that component) rather than
// as its own full-page route, approve/reject/back close the panel instead
// of navigating to /staff. Standalone use (a direct link to
// /staff/pending/:id) is unaffected — same navigate('/staff') as before.
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
  // Every {id, email} row the admin can see (same RPC the Staff list's own
  // accounts grid already uses) — kept in full, not just this registrant's
  // own row, so the duplicate-email account check below is a zero-extra-
  // query cross-reference rather than a new backend call.
  const [emailRows, setEmailRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Submitted details start read-only (see AccountDetailsSection below) —
  // this just reveals the same first-name/surname/mobile inputs the old
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

  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop
  }, [id, isAdmin])

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

  function handleRoleChange(value) {
    setRole(value)
    setCategory('') // valid category set differs per role
    setContractType('full')
    setSubtype(null)
    if (value !== 'doctor') setHasAdmin(false)
  }

  const showCategory = role === 'doctor'
  const showContractType = role === 'doctor' && categoryNeedsContractChoice(category)
  const showSubtype = showContractType && contractType === 'Junior_Doctor_Overtime'
  const adminAvailable = role === 'doctor'

  const approveDisabledReason =
    role === 'doctor' && !category ? 'Select a role and clinical category to approve.'
    : showContractType && !contractType ? 'Select EC or OT hours for this category to approve.'
    : null
  const needsAdminConfirmation = adminAvailable && hasAdmin && profile.is_admin !== true

  // ── Account checks — both derived entirely from data already on this
  // page (profile.email_verified, and the full emailRows list this load()
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

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({
      name: firstName,
      surname,
      phone: phone || null,
      is_approved: true,
      is_active: true,
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

    goBack()
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
    goBack()
  }

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

  return (
    <div className={embedded ? '' : 'mx-auto max-w-7xl pb-6 md:max-w-2xl'}>
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Pending approvals
      </button>

      <div className="space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold text-ink">Review account registration</h1>
            <Tag variant="status" tone="warning">Pending</Tag>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">Submitted {submittedDate} · {submittedTime}</p>
        </div>

        <AccountIdentityHeader profile={profile} name={fullName} tagLabel={assignedLabel} />

        <AccountDetailsSection
          heading="Submitted details"
          editing={editingDetails}
          fields={detailsFields}
          action={
            <button
              type="button"
              onClick={() => setEditingDetails(o => !o)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {editingDetails ? 'Done editing' : 'Edit submitted details'}
            </button>
          }
        />

        <RoleAndAccessSection
          heading="Access to assign"
          role={role} onRoleChange={handleRoleChange} roleOptions={ROLE_OPTIONS}
          showCategory={showCategory} category={category} onCategoryChange={setCategory} categoryOptions={CATEGORY_OPTIONS}
          showContractType={showContractType} contractType={contractType} onContractTypeChange={v => { setContractType(v); if (v !== 'Junior_Doctor_Overtime') setSubtype(null) }}
          showSubtype={showSubtype} subtype={subtype} onSubtypeChange={setSubtype}
          adminEnabled={hasAdmin} onAdminChange={setHasAdmin}
          adminAvailable={adminAvailable}
          adminUnavailableReason="Only doctor accounts can be granted admin access."
        />

        <AccountChecks checks={accountChecks} />
      </div>

      {/* Sticky footer, bled flush to whichever container's edges this page
          is actually rendering inside — the slide-over panel's own
          px-5/md:px-6 padding when embedded, or AppLayout's main
          px-4/md:px-8 when this is a standalone full-page route. */}
      <div className={`sticky bottom-0 mt-6 border-t border-slate-line bg-canvas-raised py-3 ${
        embedded ? '-mx-5 -mb-5 px-5 md:-mx-6 md:-mb-6 md:px-6' : '-mx-4 px-4 md:-mx-8 md:px-8'
      }`}>
        <AccountActionFooter
          onApprove={approve}
          onReject={reject}
          isActioning={actioning}
          approveDisabledReason={approveDisabledReason}
          needsAdminConfirmation={needsAdminConfirmation}
          registrantName={fullName}
          roleCategoryLabel={assignedLabel}
        />
      </div>
    </div>
  )
}
