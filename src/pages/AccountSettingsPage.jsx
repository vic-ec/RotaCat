import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCroppedImageBlob } from '../lib/cropImage'
import { LAST_PATH_KEY } from '../components/AppLayout'

// Maps a route path to the nav label shown for it, for the "Back to X" link
function labelForPath(pathname) {
  if (pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/roster')) return 'Roster'
  if (pathname.startsWith('/staff')) return 'Staff list'
  if (pathname.startsWith('/leave')) return 'Leave'
  if (pathname.startsWith('/swaps')) return 'Swaps'
  if (pathname.startsWith('/shifts')) return 'Open shifts'
  if (pathname.startsWith('/settings')) return 'Settings'
  return 'previous page'
}

function ArrowLeftIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

function BackButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      Back to {label}
    </button>
  )
}

// ── Display label maps ──────────────────────────────────────
// Role = account type (drives which pages/features are visible)
const ROLE_LABELS = { doctor: 'Doctor', locum: 'Locum', clerk: 'Clerk' }
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

// Category = clinical subtype. Doctor: any of these. Locum: MO/Registrar only
// (this is what makes shift-claim eligibility possible). Clerk: none.
const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  COSMO:      'COSMO',
  COSMOPsych: 'COSMO (Psych)',
  Intern:     'Intern',
  Consultant: 'Consultant',
}
const DOCTOR_CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
const LOCUM_CATEGORY_OPTIONS = [
  { value: 'MO', label: 'Medical Officer' },
  { value: 'Registrar', label: 'Registrar' },
]
function categoryOptionsForRole(role) {
  if (role === 'doctor') return DOCTOR_CATEGORY_OPTIONS
  if (role === 'locum') return LOCUM_CATEGORY_OPTIONS
  return []
}

const NOTIFICATION_LABELS = {
  roster_published:    'Roster published',
  leave_approved:      'Leave request approved',
  leave_rejected:      'Leave request rejected',
  swap_request:        'New swap request',
  swap_accepted:       'Swap accepted by colleague',
  swap_rejected:       'Swap rejected by colleague',
  swap_admin_approved: 'Swap approved by admin',
  shift_claimed:       'Advertised locum shift claimed',
  shift_cancelled:     'Advertised locum shift cancelled',
  account_approved:    'Account approved',
  account_rejected:    'Account rejected',
  reminder:            'Reminders',
  general:             'General notifications',
}
const NOTIFICATION_ORDER = [
  'roster_published', 'leave_approved', 'leave_rejected',
  'swap_request', 'swap_accepted', 'swap_rejected', 'swap_admin_approved',
  'shift_claimed', 'shift_cancelled', 'account_approved', 'account_rejected',
  'reminder', 'general',
]

// Category-level grouping shown by default; individual events move under "Advanced".
const NOTIFICATION_GROUPS = [
  { key: 'roster',  label: 'Roster',            keys: ['roster_published'] },
  { key: 'leave',   label: 'Leave',              keys: ['leave_approved', 'leave_rejected'] },
  { key: 'swaps',   label: 'Swaps',              keys: ['swap_request', 'swap_accepted', 'swap_rejected', 'swap_admin_approved'] },
  { key: 'shifts',  label: 'Open shifts',        keys: ['shift_claimed', 'shift_cancelled'] },
  { key: 'account', label: 'Account',            keys: ['account_approved', 'account_rejected'] },
  { key: 'general', label: 'Reminders & general', keys: ['reminder', 'general'] },
]

const REQUEST_STATUS_BADGE = {
  pending:  'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

// Password rule: 8+ chars, at least one lower, one upper, one digit, one symbol
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-slate-line'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function ChevronDownIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Collapsible section — keeps the settings page scannable instead of one long scroll.
function AccordionSection({ title, subtitle, defaultOpen = false, danger = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`card mb-4 overflow-hidden ${danger ? 'border-flagRed/30' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <h2 className={`text-sm font-semibold uppercase tracking-wide ${danger ? 'text-flagRed' : 'text-ink-muted'}`}>
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-slate-line px-5 py-5">{children}</div>}
    </section>
  )
}

// ── Avatar crop modal ────────────────────────────────────────
function AvatarCropModal({ imageSrc, onCancel, onConfirm, saving }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <div className="card w-full max-w-sm p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Adjust your photo</h3>
        <div className="relative h-72 w-full overflow-hidden rounded-lg bg-canvas-sunken">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="mt-4">
          <label className="label-text">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={saving} className="btn-secondary px-3 py-1.5 text-xs">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(croppedAreaPixels)}
            disabled={saving || !croppedAreaPixels}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {saving ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AccountSettingsPage() {
  const { user, profile: myProfile, isAdmin, isSuperAdmin, refreshProfile } = useAuth()
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  // Viewing someone else's account requires admin permission — enforced below via redirect.
  const targetId = routeId || user?.id
  const isOwnAccount = !routeId || routeId === user?.id

  const [targetProfile, setTargetProfile] = useState(null)
  const [targetLoadError, setTargetLoadError] = useState('')
  const [targetEmail, setTargetEmail] = useState('')

  const profile = isOwnAccount ? myProfile : targetProfile

  const [form, setForm] = useState({ name: '', surname: '', phone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)

  const [cropSrc, setCropSrc] = useState(null) // object URL while cropping
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const [prefs, setPrefs] = useState({})
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [showAdvancedNotifications, setShowAdvancedNotifications] = useState(false)

  const [pwForm, setPwForm] = useState({ current: '', password: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  // Admin: direct edit of role / category / admin flag for the account being viewed
  const [adminRole, setAdminRole] = useState('')
  const [adminCategory, setAdminCategory] = useState('')
  const [adminIsAdmin, setAdminIsAdmin] = useState(false)
  const [adminSaving, setAdminSaving] = useState(false)
  const [adminMsg, setAdminMsg] = useState(null)

  // Super-admin: transfer to another admin (own account only)
  const [otherAdmins, setOtherAdmins] = useState([])
  const [transferTargetId, setTransferTargetId] = useState('')
  const [transferConfirming, setTransferConfirming] = useState(false)
  const [transferSaving, setTransferSaving] = useState(false)
  const [transferMsg, setTransferMsg] = useState(null)

  // Non-admin: request role/category changes
  const [myRequests, setMyRequests] = useState([])
  const [requestForm, setRequestForm] = useState({ type: 'role', value: '', reason: '' })
  const [requestSaving, setRequestSaving] = useState(false)
  const [requestMsg, setRequestMsg] = useState(null)

  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

  // ── Load the account being viewed (self or, for admins, someone else) ──
  async function reloadTarget() {
    if (isOwnAccount) {
      await refreshProfile()
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', targetId).single()
    if (error) setTargetLoadError(error.message)
    else setTargetProfile(data)
  }

  useEffect(() => {
    if (isOwnAccount || !isAdmin) return
    setTargetLoadError('')
    setTargetProfile(null)
    supabase.from('profiles').select('*').eq('id', targetId).single().then(({ data, error }) => {
      if (error) setTargetLoadError(error.message)
      else setTargetProfile(data)
    })
    supabase.rpc('get_staff_emails').then(({ data }) => {
      const row = (data || []).find(r => r.id === targetId)
      setTargetEmail(row?.email || '')
    })
  }, [targetId, isOwnAccount, isAdmin])

  useEffect(() => {
    if (!profile) return
    setForm({
      name: profile.name || '',
      surname: profile.surname || '',
      phone: profile.phone || '',
    })
    setPrefs(profile.notification_prefs || {})
    setAdminRole(profile.role || '')
    setAdminCategory(profile.category || '')
    setAdminIsAdmin(profile.is_admin === true)
  }, [profile])

  useEffect(() => {
    if (isOwnAccount && user) setNewEmail(user.email || '')
  }, [user, isOwnAccount])

  useEffect(() => {
    if (!user) return
    loadMyRequests()
  }, [user])

  useEffect(() => {
    if (!isSuperAdmin || !user || !isOwnAccount) return
    supabase
      .from('profiles')
      .select('id, name, surname')
      .eq('is_admin', true)
      .neq('id', user.id)
      .then(({ data }) => setOtherAdmins(data || []))
  }, [isSuperAdmin, user, isOwnAccount])

  async function loadMyRequests() {
    const { data, error } = await supabase
      .from('account_change_requests')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
    if (!error) setMyRequests(data || [])
  }

  const pendingDeletion = myRequests.some(r => r.request_type === 'deletion' && r.status === 'pending')
  const pendingRoleOrCategory = myRequests.find(
    r => (r.request_type === 'role' || r.request_type === 'category') && r.status === 'pending'
  )

  // ── Profile details ─────────────────────────────────────────
  async function saveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)

    const { error } = await supabase
      .from('profiles')
      .update({ name: form.name.trim(), surname: form.surname.trim(), phone: form.phone.trim() || null })
      .eq('id', targetId)

    setSavingProfile(false)
    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
    } else {
      setProfileMsg({ type: 'success', text: 'Saved.' })
      reloadTarget()
    }
  }

  // ── Email (own account only — Supabase auth can only change the logged-in user's own email) ──
  async function changeEmail(e) {
    e.preventDefault()
    setEmailMsg(null)

    if (!newEmail || newEmail === user.email) {
      setEmailMsg({ type: 'error', text: 'Enter a different email address.' })
      return
    }

    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    setEmailSaving(false)

    if (error) {
      setEmailMsg({ type: 'error', text: error.message })
    } else {
      setEmailMsg({
        type: 'success',
        text: 'Check both your old and new inbox for confirmation links — the change only applies once confirmed.',
      })
    }
  }

  // ── Avatar (own account only) ────────────────────────────────
  function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError('Image must be under 8MB.')
      return
    }
    setCropSrc(URL.createObjectURL(file))
    e.target.value = '' // allow re-selecting the same file later
  }

  async function confirmCrop(croppedAreaPixels) {
    if (!croppedAreaPixels) return
    setUploadingAvatar(true)
    setAvatarError('')

    try {
      const blob = await getCroppedImageBlob(cropSrc, croppedAreaPixels)
      const path = `${user.id}/avatar.jpg`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, cacheControl: '3600', contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      refreshProfile()
      URL.revokeObjectURL(cropSrc)
      setCropSrc(null)
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setUploadingAvatar(false)
    }
  }

  // ── Notification preferences (own account only) ─────────────
  // Accepts a batch of keys so "all notifications" / category-level toggles
  // can flip several at once in a single save.
  async function togglePrefs(keys, value) {
    const prev = prefs
    const next = { ...prefs }
    for (const key of keys) next[key] = value
    setPrefs(next)
    setPrefsSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: next })
      .eq('id', user.id)
    setPrefsSaving(false)
    if (error) {
      setPrefs(prev)
      alert('Could not save notification preference: ' + error.message)
    }
  }

  // ── Password (own account only) ──────────────────────────────
  async function changePassword(e) {
    e.preventDefault()
    setPwMsg(null)

    if (!pwForm.current) {
      setPwMsg({ type: 'error', text: 'Enter your current password.' })
      return
    }
    if (!PASSWORD_RULE.test(pwForm.password)) {
      setPwMsg({ type: 'error', text: 'New password doesn’t meet the requirements above.' })
      return
    }
    if (pwForm.password !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setPwSaving(true)

    // Verify the current password by re-authenticating before changing it
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwForm.current,
    })
    if (verifyError) {
      setPwSaving(false)
      setPwMsg({ type: 'error', text: 'Current password is incorrect.' })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: pwForm.password })
    setPwSaving(false)

    if (error) {
      setPwMsg({ type: 'error', text: error.message })
    } else {
      setPwMsg({ type: 'success', text: 'Password updated.' })
      setPwForm({ current: '', password: '', confirm: '' })
    }
  }

  // ── Admin: direct role/category/admin-flag edit ─────────────
  function handleAdminRoleChange(value) {
    setAdminRole(value)
    setAdminCategory('') // clear — the valid category set differs per role
  }

  async function saveAdminAccountFields() {
    setAdminSaving(true)
    setAdminMsg(null)

    if (adminRole === 'doctor' && !adminCategory) {
      setAdminSaving(false)
      setAdminMsg({ type: 'error', text: 'Select a category for a doctor account.' })
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        role: adminRole,
        category: adminRole === 'clerk' ? null : (adminCategory || null),
        is_admin: adminRole === 'clerk' ? false : adminIsAdmin,
      })
      .eq('id', targetId)

    setAdminSaving(false)
    if (error) {
      setAdminMsg({ type: 'error', text: error.message })
    } else {
      setAdminMsg({ type: 'success', text: 'Saved.' })
      reloadTarget()
    }
  }

  // ── Super-admin: transfer to another admin ──────────────────
  async function transferSuperAdmin() {
    if (!transferTargetId) return
    setTransferSaving(true)
    setTransferMsg(null)

    const { error } = await supabase.rpc('transfer_super_admin', { new_super_admin_id: transferTargetId })

    setTransferSaving(false)
    setTransferConfirming(false)
    if (error) {
      setTransferMsg({ type: 'error', text: error.message })
    } else {
      setTransferMsg({ type: 'success', text: 'Super-admin transferred.' })
      refreshProfile()
    }
  }

  // ── Non-admin: request role/category change ────────────────
  async function submitChangeRequest(e) {
    e.preventDefault()
    setRequestMsg(null)

    if (!requestForm.value) {
      setRequestMsg({ type: 'error', text: 'Choose the new value you’re requesting.' })
      return
    }

    setRequestSaving(true)
    const currentValue = requestForm.type === 'role' ? profile.role : profile.category
    const { error } = await supabase.from('account_change_requests').insert({
      profile_id: user.id,
      request_type: requestForm.type,
      current_value: currentValue,
      requested_value: requestForm.value,
      reason: requestForm.reason.trim() || null,
    })
    setRequestSaving(false)

    if (error) {
      setRequestMsg({ type: 'error', text: error.message })
    } else {
      setRequestMsg({ type: 'success', text: 'Request submitted — an admin will review it.' })
      setRequestForm({ type: 'role', value: '', reason: '' })
      loadMyRequests()
    }
  }

  // ── Account deletion request ────────────────────────────────
  async function requestDeletion() {
    setDeleteSaving(true)
    const { error } = await supabase.from('account_change_requests').insert({
      profile_id: user.id,
      request_type: 'deletion',
      current_value: null,
      requested_value: null,
      reason: null,
    })
    setDeleteSaving(false)
    setDeleteConfirming(false)
    if (error) {
      alert('Could not submit deletion request: ' + error.message)
    } else {
      loadMyRequests()
    }
  }

  // Non-admins may only ever view their own account.
  if (routeId && routeId !== user?.id && !isAdmin) {
    return <Navigate to="/account" replace />
  }

  const lastPath = sessionStorage.getItem(LAST_PATH_KEY) || '/'
  const backLabel = labelForPath(lastPath)

  if (!isOwnAccount && targetLoadError) {
    return (
      <div className="mx-auto max-w-2xl pb-12">
        {isAdmin && <BackButton onClick={() => navigate(lastPath)} label={backLabel} />}
        <div className="card border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">Couldn't load this account: {targetLoadError}</p>
          <Link to="/staff" className="btn-secondary mt-3 inline-block px-3 py-1.5 text-xs">Back to Staff list</Link>
        </div>
      </div>
    )
  }

  if (!profile) return <p className="text-sm text-ink-muted">Loading…</p>

  const displayEmail = isOwnAccount ? user.email : targetEmail

  const visibleNotificationKeys = NOTIFICATION_ORDER.filter(key => key in prefs)
  const allNotificationsOn = visibleNotificationKeys.length > 0 &&
    visibleNotificationKeys.every(key => prefs[key] !== false)

  return (
    <div className="mx-auto max-w-2xl pb-12">
      {isAdmin && <BackButton onClick={() => navigate(lastPath)} label={backLabel} />}
      <div className="mb-6">
        {!isOwnAccount && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-flagBlue/30 bg-flagBlue-bg px-3 py-2 text-xs text-flagBlue">
            <span>
              Viewing account settings for <strong>{profile.name} {profile.surname}</strong> as an admin.
            </span>
          </div>
        )}
        <h1 className="font-display text-2xl text-ink">Account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isOwnAccount
            ? 'Manage your profile, notifications, and account security.'
            : "Manage this person's profile, role, and permissions."}
        </p>
      </div>

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          saving={uploadingAvatar}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null) }}
          onConfirm={confirmCrop}
        />
      )}

      {/* ── Profile ───────────────────────────────────────────── */}
      <AccordionSection title="Profile" defaultOpen>
        <div className="mb-5 flex items-center gap-4">
          <div className="relative">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-1 ring-slate-line"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light text-lg font-medium text-accent-dark ring-1 ring-slate-line">
                {(profile.name?.[0] || '') + (profile.surname?.[0] || '')}
              </div>
            )}
          </div>
          {isOwnAccount && (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                Change photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
              {avatarError && <p className="mt-1 text-xs text-flagRed">{avatarError}</p>}
            </div>
          )}
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="label-text">First name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">Surname</label>
            <input
              type="text"
              value={form.surname}
              onChange={e => setForm(f => ({ ...f, surname: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">Mobile number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. 082 123 4567"
              className="input-field"
            />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={savingProfile} className="btn-primary">
              {savingProfile ? 'Saving…' : 'Update'}
            </button>
            {profileMsg && (
              <span className={`text-xs font-medium ${profileMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                {profileMsg.text}
              </span>
            )}
          </div>
        </form>
      </AccordionSection>

      {/* ── Email ───────────────────────────────────────────── */}
      <AccordionSection title="Email address" subtitle={displayEmail || undefined}>
        {isOwnAccount ? (
          <form onSubmit={changeEmail} className="space-y-3">
            <div>
              <label className="label-text">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="input-field"
              />
            </div>
            <p className="text-xs text-ink-muted">
              This is also your login username. Changing it sends confirmation links to both your old and new address —
              the change only takes effect once confirmed, so it won't lock you out.
            </p>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={emailSaving} className="btn-primary">
                {emailSaving ? 'Sending…' : 'Update'}
              </button>
              {emailMsg && (
                <span className={`text-xs font-medium ${emailMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                  {emailMsg.text}
                </span>
              )}
            </div>
          </form>
        ) : (
          <div>
            <label className="label-text">Email</label>
            <input type="email" value={displayEmail || '—'} disabled className="input-field cursor-not-allowed opacity-60" />
            <p className="mt-1 text-xs text-ink-muted">Only the account holder can change their own email address.</p>
          </div>
        )}
      </AccordionSection>

      {/* ── Role, category & permissions ────────────────────── */}
      <AccordionSection title="Role, category & permissions">
        {isAdmin ? (
          <div className="space-y-4">
            <div>
              <label className="label-text">Role</label>
              <select
                value={adminRole}
                onChange={e => handleAdminRoleChange(e.target.value)}
                className="input-field"
              >
                {ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            {adminRole !== 'clerk' && (
              <div>
                <label className="label-text">Category</label>
                <select value={adminCategory} onChange={e => setAdminCategory(e.target.value)} className="input-field">
                  <option value="">{adminRole === 'locum' ? 'None' : 'Select…'}</option>
                  {categoryOptionsForRole(adminRole).map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}

            {adminRole !== 'clerk' && (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={adminIsAdmin}
                  onChange={e => setAdminIsAdmin(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-line accent-accent"
                />
                Has admin permissions
                {profile.is_super_admin && <span className="text-xs text-ink-muted">(super-admin — can't be removed here)</span>}
              </label>
            )}

            <div className="flex items-center gap-3">
              <button onClick={saveAdminAccountFields} disabled={adminSaving} className="btn-primary">
                {adminSaving ? 'Saving…' : 'Update'}
              </button>
              {adminMsg && (
                <span className={`text-xs font-medium ${adminMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                  {adminMsg.text}
                </span>
              )}
            </div>

            {isOwnAccount && isSuperAdmin && (
              <div className="mt-2 border-t border-slate-line pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Super-admin</p>
                {otherAdmins.length === 0 ? (
                  <p className="text-xs text-ink-muted">
                    No other admins yet — make someone else an admin first to be able to transfer this.
                  </p>
                ) : transferConfirming ? (
                  <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3">
                    <p className="mb-2 text-xs text-flagAmber">
                      This immediately hands off super-admin — you won't be able to take it back yourself.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={transferSuperAdmin}
                        disabled={transferSaving}
                        className="rounded bg-flagAmber px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        {transferSaving ? 'Transferring…' : 'Confirm transfer'}
                      </button>
                      <button onClick={() => setTransferConfirming(false)} className="btn-secondary px-3 py-1.5 text-xs">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={transferTargetId}
                      onChange={e => setTransferTargetId(e.target.value)}
                      className="input-field w-auto flex-1"
                    >
                      <option value="">Transfer to…</option>
                      {otherAdmins.map(a => (
                        <option key={a.id} value={a.id}>{a.name} {a.surname}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setTransferConfirming(true)}
                      disabled={!transferTargetId}
                      className="btn-secondary px-3 py-1.5 text-xs whitespace-nowrap"
                    >
                      Transfer
                    </button>
                  </div>
                )}
                {transferMsg && (
                  <span className={`mt-2 block text-xs font-medium ${transferMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                    {transferMsg.text}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label-text">Role</label>
              <select value={profile.role || ''} disabled className="input-field cursor-not-allowed opacity-60">
                <option value={profile.role || ''}>{ROLE_LABELS[profile.role] || profile.role}</option>
              </select>
            </div>
            <div>
              <label className="label-text">Category</label>
              <select value={profile.category || ''} disabled className="input-field cursor-not-allowed opacity-60">
                <option value={profile.category || ''}>{profile.category ? (CATEGORY_LABELS[profile.category] || profile.category) : 'None'}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={profile.is_admin === true}
                disabled
                className="h-4 w-4 rounded border-slate-line opacity-50 cursor-not-allowed"
              />
              Has admin permissions
            </label>

            <div className="rounded-lg border border-flagBlue/30 bg-flagBlue-bg p-3 text-xs text-flagBlue">
              Role and category changes need admin approval before they take effect.
            </div>

            {pendingRoleOrCategory ? (
              <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3 text-xs text-flagAmber">
                A {pendingRoleOrCategory.request_type} change to "{pendingRoleOrCategory.requested_value}" is pending admin review.
              </div>
            ) : (
              <form onSubmit={submitChangeRequest} className="space-y-3 rounded-lg border border-slate-line bg-canvas-sunken p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-text">Change</label>
                    <select
                      value={requestForm.type}
                      onChange={e => setRequestForm(f => ({ ...f, type: e.target.value, value: '' }))}
                      className="input-field"
                    >
                      <option value="role">Role</option>
                      {(profile.role === 'doctor' || profile.role === 'locum') && <option value="category">Category</option>}
                    </select>
                  </div>
                  <div>
                    <label className="label-text">New value</label>
                    <select
                      value={requestForm.value}
                      onChange={e => setRequestForm(f => ({ ...f, value: e.target.value }))}
                      className="input-field"
                    >
                      <option value="">Select…</option>
                      {(requestForm.type === 'role' ? ROLE_OPTIONS : categoryOptionsForRole(profile.role)).map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {requestForm.type === 'role' && profile.role !== 'doctor' && requestForm.value === 'doctor' && (
                  <p className="text-xs text-ink-muted">
                    Once this is approved, you'll be able to submit a separate request to set your clinical category.
                  </p>
                )}
                <div>
                  <label className="label-text">Reason (optional)</label>
                  <textarea
                    value={requestForm.reason}
                    onChange={e => setRequestForm(f => ({ ...f, reason: e.target.value }))}
                    rows={2}
                    className="input-field"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={requestSaving} className="btn-secondary text-xs">
                    {requestSaving ? 'Submitting…' : 'Submit request'}
                  </button>
                  {requestMsg && (
                    <span className={`text-xs font-medium ${requestMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                      {requestMsg.text}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        )}
      </AccordionSection>

      {/* ── Notification preferences (own account only) ─────── */}
      {isOwnAccount && (
        <AccordionSection title="Notifications" subtitle={prefsSaving ? 'Saving…' : undefined}>
          <div className="flex items-center justify-between border-b border-slate-line pb-3">
            <div>
              <p className="text-sm font-medium text-ink">All notifications</p>
              <p className="text-xs text-ink-muted">Turn every notification on or off at once.</p>
            </div>
            <Toggle checked={allNotificationsOn} onChange={v => togglePrefs(visibleNotificationKeys, v)} />
          </div>

          <div className="divide-y divide-slate-line">
            {NOTIFICATION_GROUPS.map(group => {
              const visibleKeys = group.keys.filter(key => key in prefs)
              if (visibleKeys.length === 0) return null
              const groupOn = visibleKeys.every(key => prefs[key] !== false)
              return (
                <div key={group.key} className="flex items-center justify-between py-3">
                  <span className="text-sm text-ink">{group.label}</span>
                  <Toggle checked={groupOn} onChange={v => togglePrefs(visibleKeys, v)} />
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedNotifications(s => !s)}
            className="mt-3 text-xs font-medium text-accent hover:text-accent-dark"
          >
            {showAdvancedNotifications ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>

          {showAdvancedNotifications && (
            <div className="mt-2 divide-y divide-slate-line border-t border-slate-line">
              {NOTIFICATION_ORDER.filter(key => key in prefs).map(key => (
                <div key={key} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-ink">{NOTIFICATION_LABELS[key] || key}</span>
                  <Toggle checked={prefs[key] !== false} onChange={v => togglePrefs([key], v)} />
                </div>
              ))}
            </div>
          )}
        </AccordionSection>
      )}

      {/* ── Change password (own account only) ──────────────── */}
      {isOwnAccount && (
        <AccordionSection title="Change password">
          <div className="mb-4 rounded-lg border border-flagBlue/30 bg-flagBlue-bg p-3 text-xs text-flagBlue">
            {PASSWORD_HINT}
          </div>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="label-text">Current password</label>
              <input
                type="password"
                value={pwForm.current}
                onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                className="input-field"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label-text">New password</label>
              <input
                type="password"
                value={pwForm.password}
                onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))}
                className="input-field"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label-text">Confirm password</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                className="input-field"
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pwSaving} className="btn-primary">
                {pwSaving ? 'Updating…' : 'Update'}
              </button>
              {pwMsg && (
                <span className={`text-xs font-medium ${pwMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                  {pwMsg.text}
                </span>
              )}
            </div>
          </form>
        </AccordionSection>
      )}

      {/* ── Request history (own account only) ───────────────── */}
      {isOwnAccount && myRequests.length > 0 && (
        <AccordionSection title="Your requests" subtitle={`${myRequests.length} submitted`}>
          <div className="divide-y divide-slate-line">
            {myRequests.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium text-ink capitalize">{r.request_type}</span>
                  {r.requested_value && <span className="text-ink-muted"> → {r.requested_value}</span>}
                  <p className="text-xs text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REQUEST_STATUS_BADGE[r.status]}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </AccordionSection>
      )}

      {/* ── Danger zone (own account only) ───────────────────── */}
      {isOwnAccount && (
        <AccordionSection title="Danger zone" danger>
          {pendingDeletion ? (
            <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3 text-xs text-flagAmber">
              Your account deletion request is pending admin review.
            </div>
          ) : deleteConfirming ? (
            <div className="rounded-lg border border-flagRed/30 bg-flagRed-bg p-4">
              <p className="mb-3 text-sm text-flagRed">
                This sends an account deletion request to an admin for review. Continue?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={requestDeletion}
                  disabled={deleteSaving}
                  className="rounded bg-flagRed px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  {deleteSaving ? 'Submitting…' : 'Yes, request deletion'}
                </button>
                <button onClick={() => setDeleteConfirming(false)} className="btn-secondary px-3 py-1.5 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirming(true)}
              className="rounded border border-flagRed px-3 py-1.5 text-xs font-medium text-flagRed hover:bg-flagRed-bg"
            >
              Request account deletion
            </button>
          )}
        </AccordionSection>
      )}
    </div>
  )
}
