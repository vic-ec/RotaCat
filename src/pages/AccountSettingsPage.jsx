import { useEffect, useRef, useState, useCallback, forwardRef } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCroppedImageBlob } from '../lib/cropImage'
import { LAST_PATH_KEY } from '../components/AppLayout'
import ProfileAvatar, { StatusBadge } from '../components/ProfileAvatar'
import { AVATAR_COLOR_PALETTE, NEUTRAL_AVATAR_COLOR, randomAvatarColor } from '../lib/color'
import { PATTERN_TYPES, randomPatternType, patternBackgroundStyle } from '../lib/avatarPatterns'
import { formatPhoneDisplay } from '../lib/phone'

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
      className="sticky top-14 md:top-0 z-[5] mb-4 inline-flex items-center gap-1.5 rounded bg-canvas px-2 py-1.5 -ml-2 text-sm font-medium text-ink-light hover:text-ink"
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

// Birthday only ever needs day + month (it's used to keep someone off shift
// on their recurring birthday, not to compute an age) — stored as a date
// with a fixed placeholder year so the column stays a plain `date`. 2000 is
// a leap year so 29 February stays a selectable day for everyone.
const BIRTHDAY_YEAR = 2000
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function birthdayToDayMonth(iso) {
  if (!iso) return { day: '', month: '' }
  const [, month, day] = iso.split('-')
  return { day: String(Number(day)), month: String(Number(month)) }
}
function dayMonthToBirthday(day, month) {
  if (!day || !month) return ''
  return `${BIRTHDAY_YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function formatBirthdayDisplay(iso) {
  const { day, month } = birthdayToDayMonth(iso)
  if (!day || !month) return null
  return `${day} ${MONTH_NAMES[Number(month) - 1]}`
}

// Briefly shows "Saved." on an Update button in place of its normal label.
const SAVED_FLASH_MS = 2500
function flashSaved(setJustSaved) {
  setJustSaved(true)
  setTimeout(() => setJustSaved(false), SAVED_FLASH_MS)
}

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
// Supports an optional externally-controlled open state (e.g. "Change appearance"
// jumping straight to the Appearance section) alongside the default uncontrolled mode.
const AccordionSection = forwardRef(function AccordionSection(
  { title, subtitle, defaultOpen = false, danger = false, children, open: controlledOpen, onOpenChange, subtitleMultiline = false },
  ref
) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  function toggle() {
    if (isControlled) onOpenChange?.(!open)
    else setInternalOpen(o => !o)
  }

  return (
    <section ref={ref} className={`card mb-4 overflow-hidden ${danger ? 'border-flagRed/30' : ''}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <h2 className={`text-sm font-semibold uppercase tracking-wide ${danger ? 'text-flagRed' : 'text-ink-muted'}`}>
            {title}
          </h2>
          {subtitle && (
            <div className={`mt-1 text-2xl text-ink-muted ${subtitleMultiline ? '' : 'truncate'}`}>
              {subtitle}
            </div>
          )}
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-slate-line px-5 py-5">{children}</div>}
    </section>
  )
})

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

  const [form, setForm] = useState({ name: '', surname: '', birthdayDay: '', birthdayMonth: '', phone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileJustSaved, setProfileJustSaved] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)

  const [cropSrc, setCropSrc] = useState(null) // object URL while cropping
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const photoMenuRef = useRef(null)

  useEffect(() => {
    if (!photoMenuOpen) return
    function onClickOutside(e) {
      if (photoMenuRef.current && !photoMenuRef.current.contains(e.target)) setPhotoMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [photoMenuOpen])

  const [prefs, setPrefs] = useState({})
  const [showAdvancedNotifications, setShowAdvancedNotifications] = useState(false)

  // Appearance: colour + pattern (own account only)
  const [colorForm, setColorForm] = useState({ colorCode: NEUTRAL_AVATAR_COLOR, patternType: null })
  const [colorSaving, setColorSaving] = useState(false)
  const [colorJustSaved, setColorJustSaved] = useState(false)
  const [surprising, setSurprising] = useState(false)
  const [colorMsg, setColorMsg] = useState(null)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const appearanceSectionRef = useRef(null)

  function jumpToAppearance() {
    setAppearanceOpen(true)
    appearanceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const [pwForm, setPwForm] = useState({ current: '', password: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwJustSaved, setPwJustSaved] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  // Admin: direct edit of role / category / admin flag for the account being viewed
  const [adminRole, setAdminRole] = useState('')
  const [adminCategory, setAdminCategory] = useState('')
  const [adminIsAdmin, setAdminIsAdmin] = useState(false)
  const [adminIsActive, setAdminIsActive] = useState(true)
  const [adminSaving, setAdminSaving] = useState(false)
  const [adminJustSaved, setAdminJustSaved] = useState(false)
  const [adminMsg, setAdminMsg] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  const [isOnLeave, setIsOnLeave] = useState(false)

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
    const { day, month } = birthdayToDayMonth(profile.birthday)
    setForm({
      name: profile.name || '',
      surname: profile.surname || '',
      birthdayDay: day,
      birthdayMonth: month,
      phone: profile.phone || '',
    })
    setPrefs(profile.notification_prefs || {})
    setAdminRole(profile.role || '')
    setAdminCategory(profile.category || '')
    setAdminIsAdmin(profile.is_admin === true)
    setAdminIsActive(profile.is_active !== false)
    setColorForm({
      colorCode: profile.color_code || NEUTRAL_AVATAR_COLOR,
      patternType: profile.pattern_type || null,
    })
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

  useEffect(() => {
    if (!targetId) return
    supabase.rpc('get_current_leave_profile_ids').then(({ data }) => {
      setIsOnLeave((data || []).some(r => r.profile_id === targetId))
    })
  }, [targetId])

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
  // Day and month are kept as independent fields (not derived from a single
  // combined date) so picking just one of them doesn't get discarded while
  // waiting for the other — that was the earlier bug where a lone pick
  // silently reverted back to the placeholder.
  function setBirthdayPart(part, value) {
    setForm(f => {
      let day = part === 'day' ? value : f.birthdayDay
      let month = part === 'month' ? value : f.birthdayMonth
      if (day && month) {
        const maxDay = DAYS_IN_MONTH[Number(month) - 1]
        if (Number(day) > maxDay) day = String(maxDay)
      }
      return { ...f, birthdayDay: day, birthdayMonth: month }
    })
  }

  // `profile` is briefly null right after navigating to someone else's
  // account (or on first load) while it's still being fetched — these run
  // on every render regardless, so they must tolerate that instead of
  // crashing the whole app on a bare `profile.x` dereference.
  const profileDirty =
    form.name.trim() !== (profile?.name || '') ||
    form.surname.trim() !== (profile?.surname || '') ||
    (dayMonthToBirthday(form.birthdayDay, form.birthdayMonth) || null) !== (profile?.birthday || null) ||
    (form.phone.trim() || null) !== (profile?.phone || null)

  async function saveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)

    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim(),
        surname: form.surname.trim(),
        birthday: dayMonthToBirthday(form.birthdayDay, form.birthdayMonth) || null,
        phone: form.phone.trim() || null,
      })
      .eq('id', targetId)

    setSavingProfile(false)
    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
    } else {
      flashSaved(setProfileJustSaved)
      reloadTarget()
    }
  }

  // ── Email (own account only — Supabase auth can only change the logged-in user's own email) ──
  const emailDirty = Boolean(newEmail) && newEmail !== user.email

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

  async function deleteAvatar() {
    setUploadingAvatar(true)
    setAvatarError('')
    await supabase.storage.from('avatars').remove([`${user.id}/avatar.jpg`])
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id)
    setUploadingAvatar(false)
    if (error) {
      setAvatarError(error.message)
      return
    }
    refreshProfile()
  }

  // ── Notification preferences (own account only) ─────────────
  // Accepts a batch of keys so "all notifications" / category-level toggles
  // can flip several at once in a single save.
  async function togglePrefs(keys, value) {
    const prev = prefs
    const next = { ...prefs }
    for (const key of keys) next[key] = value
    setPrefs(next)
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: next })
      .eq('id', user.id)
    if (error) {
      setPrefs(prev)
      alert('Could not save notification preference: ' + error.message)
    }
  }

  // ── Appearance: colour + pattern (own account only) ──────────
  // Checks whether another *active* profile already has this exact combo —
  // an inactive profile's combo is implicitly "recycled" since it's excluded
  // here. Manual picks just get a heads-up (cosmetic, not blocking); Surprise
  // me actively avoids collisions instead since there's no cost to retrying.
  async function checkComboTaken(colorCode, patternType) {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .eq('color_code', colorCode)
      .neq('id', user.id)
    query = patternType ? query.eq('pattern_type', patternType) : query.is('pattern_type', null)
    const { data } = await query
    return (data || []).length > 0
  }

  // Picks only stage locally — nothing is written until Update is clicked.
  // Each pick still runs a read-only collision preview so the warning stays
  // current, but mashing Surprise me! no longer fires a wave of concurrent
  // writes that can race/slow down/error.
  async function previewCombo(colorCode, patternType) {
    const taken = await checkComboTaken(colorCode, patternType)
    setColorMsg(taken ? { type: 'warning', text: 'Another active staff member already has this exact colour + pattern.' } : null)
  }
  function pickColorSwatch(hex) {
    const next = { ...colorForm, colorCode: hex }
    setColorForm(next)
    previewCombo(next.colorCode, next.patternType)
  }
  function pickPatternType(patternType) {
    const next = { ...colorForm, patternType }
    setColorForm(next)
    previewCombo(next.colorCode, next.patternType)
  }
  async function surpriseMe() {
    if (surprising) return
    setSurprising(true)
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('id, color_code, pattern_type')
      .eq('is_active', true)
    const taken = new Set(
      (activeProfiles || [])
        .filter(p => p.id !== user.id)
        .map(p => `${p.color_code}|${p.pattern_type || ''}`)
    )
    let colorCode, patternType, attempts = 0
    do {
      colorCode = randomAvatarColor()
      patternType = randomPatternType()
      attempts += 1
    } while (taken.has(`${colorCode}|${patternType}`) && attempts < 30)
    setColorForm({ colorCode, patternType })
    setSurprising(false)
    previewCombo(colorCode, patternType)
  }
  async function saveAppearance() {
    setColorSaving(true)
    setColorMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ color_code: colorForm.colorCode, pattern_type: colorForm.patternType })
      .eq('id', user.id)
    setColorSaving(false)
    if (error) {
      setColorMsg({ type: 'error', text: error.message })
      return
    }
    refreshProfile()
    flashSaved(setColorJustSaved)
    const taken = await checkComboTaken(colorForm.colorCode, colorForm.patternType)
    if (taken) {
      setColorMsg({ type: 'warning', text: 'Another active staff member already has this exact colour + pattern.' })
    }
  }
  // Discards any unsaved local picks, reverting back to what's actually saved.
  function cancelAppearance() {
    setColorForm({
      colorCode: profile.color_code || NEUTRAL_AVATAR_COLOR,
      patternType: profile.pattern_type || null,
    })
    setColorMsg(null)
  }
  const isColorDirty = colorForm.colorCode !== (profile?.color_code || NEUTRAL_AVATAR_COLOR)
    || colorForm.patternType !== (profile?.pattern_type || null)

  // ── Password (own account only) ──────────────────────────────
  const pwDirty = Boolean(pwForm.current || pwForm.password || pwForm.confirm)

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
      flashSaved(setPwJustSaved)
      setPwForm({ current: '', password: '', confirm: '' })
    }
  }

  // ── Admin: direct role/category/admin-flag edit ─────────────
  function handleAdminRoleChange(value) {
    setAdminRole(value)
    setAdminCategory('') // clear — the valid category set differs per role
  }

  const adminFieldsDirty =
    adminRole !== (profile?.role || '') ||
    adminCategory !== (profile?.category || '') ||
    adminIsAdmin !== (profile?.is_admin === true)

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
      flashSaved(setAdminJustSaved)
      reloadTarget()
    }
  }

  // ── Status: active/inactive (admin-editable, its own section) ──
  async function saveActiveStatus(nextActive) {
    const prevActive = adminIsActive
    setAdminIsActive(nextActive)
    setStatusMsg(null)

    const { error } = await supabase
      .from('profiles')
      .update({ is_active: nextActive })
      .eq('id', targetId)

    if (error) {
      setAdminIsActive(prevActive)
      setStatusMsg({ type: 'error', text: error.message })
    } else {
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
      <AccordionSection
        title="Profile"
        subtitleMultiline
        subtitle={
          <span className="inline-flex items-center gap-3">
            {profile.avatar_url ? (
              <span className="inline-flex flex-shrink-0 items-center gap-1.5">
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-7 w-7 flex-shrink-0 rounded-full border border-canvas-raised object-cover"
                />
                <ProfileAvatar profile={profile} size={28} soloFill />
              </span>
            ) : (
              <ProfileAvatar profile={profile} size={28} />
            )}
            <span className="flex min-w-0 flex-col leading-snug">
              <span className="truncate font-semibold text-ink">{profile.name} {profile.surname}</span>
              {formatPhoneDisplay(profile.phone) && <span className="truncate">{formatPhoneDisplay(profile.phone)}</span>}
              {formatBirthdayDisplay(profile.birthday) && <span className="truncate">{formatBirthdayDisplay(profile.birthday)}</span>}
            </span>
          </span>
        }
      >
        <div className="mb-5 flex items-center gap-4">
          <ProfileAvatar profile={profile} size={64} />
          {isOwnAccount && (
            <div>
              <div className="flex flex-wrap gap-2">
                <div className="relative" ref={photoMenuRef}>
                  <button
                    type="button"
                    onClick={() => setPhotoMenuOpen(o => !o)}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Change picture
                  </button>
                  {photoMenuOpen && (
                    <div className="absolute left-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-line bg-canvas-raised shadow-raised">
                      <button
                        type="button"
                        onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click() }}
                        className="block w-full px-3 py-2 text-left text-xs text-ink hover:bg-canvas-sunken"
                      >
                        Upload picture
                      </button>
                      {profile.avatar_url && (
                        <button
                          type="button"
                          onClick={() => { setPhotoMenuOpen(false); deleteAvatar() }}
                          className="block w-full px-3 py-2 text-left text-xs text-flagRed hover:bg-flagRed-bg"
                        >
                          Delete picture
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={jumpToAppearance}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Change appearance
                </button>
              </div>
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
            <label className="label-text">Birthday</label>
            {/* Day + month only — no year, since this only ever needs to
                recur annually. Plain selects also sidestep the iOS Safari
                bug where native date inputs can render wider than their box
                regardless of CSS width. */}
            <div className="flex gap-2">
              <select
                value={form.birthdayDay}
                onChange={e => setBirthdayPart('day', e.target.value)}
                className="input-field"
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                value={form.birthdayMonth}
                onChange={e => setBirthdayPart('month', e.target.value)}
                className="input-field"
              >
                <option value="">Month</option>
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
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
            <button type="submit" disabled={savingProfile || !profileDirty} className="btn-primary">
              {savingProfile ? 'Saving…' : profileJustSaved ? 'Saved.' : 'Update'}
            </button>
            {profileMsg && (
              <span className="text-xs font-medium text-flagRed">{profileMsg.text}</span>
            )}
          </div>
        </form>
      </AccordionSection>

      {/* ── Status ────────────────────────────────────────────── */}
      <AccordionSection
        title="Status"
        subtitle={
          <span className={`font-medium ${!adminIsActive ? 'text-flagRed' : isOnLeave ? 'text-ink-muted' : 'text-success'}`}>
            {!adminIsActive ? 'Inactive' : isOnLeave ? 'On leave' : 'Active'}
          </span>
        }
      >
        {isAdmin ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Account active</p>
              <p className="text-xs text-ink-muted">Inactive accounts remain on record but are excluded from roster generation.</p>
              {adminIsActive && isOnLeave && (
                <p className="mt-1 text-xs text-ink-muted">🏖️ Currently on approved leave.</p>
              )}
            </div>
            <Toggle checked={adminIsActive} onChange={saveActiveStatus} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <StatusBadge active={adminIsActive} onLeave={isOnLeave} size={18} />
            <span className={`text-sm font-medium ${!adminIsActive ? 'text-flagRed' : isOnLeave ? 'text-ink-muted' : 'text-success'}`}>
              {!adminIsActive ? 'Inactive' : isOnLeave ? 'On leave' : 'Active'}
            </span>
          </div>
        )}
        {statusMsg && (
          <span className={`mt-2 block text-xs font-medium ${statusMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
            {statusMsg.text}
          </span>
        )}
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
              <button type="submit" disabled={emailSaving || !emailDirty} className="btn-primary">
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

      {/* ── Category, Role & Permissions ─────────────────────── */}
      <AccordionSection
        title="Category, Role & Permissions"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <span>
              {profile.role === 'doctor'
                ? (CATEGORY_LABELS[profile.category] || profile.category || '—')
                : (ROLE_LABELS[profile.role] || profile.role)}
            </span>
            {profile.is_admin && (
              <span className="font-medium text-accent">{profile.is_super_admin ? 'Super-admin' : 'Admin'}</span>
            )}
          </span>
        }
      >
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
              <button onClick={saveAdminAccountFields} disabled={adminSaving || !adminFieldsDirty} className="btn-primary">
                {adminSaving ? 'Saving…' : adminJustSaved ? 'Saved.' : 'Update'}
              </button>
              {adminMsg && (
                <span className="text-xs font-medium text-flagRed">{adminMsg.text}</span>
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
              <button type="submit" disabled={pwSaving || !pwDirty} className="btn-primary">
                {pwSaving ? 'Updating…' : pwJustSaved ? 'Saved.' : 'Update'}
              </button>
              {pwMsg && (
                <span className="text-xs font-medium text-flagRed">{pwMsg.text}</span>
              )}
            </div>
          </form>
        </AccordionSection>
      )}

      {/* ── Appearance: colour + pattern (own account only) ────── */}
      {isOwnAccount && (
        <AccordionSection
          ref={appearanceSectionRef}
          title="Appearance"
          open={appearanceOpen}
          onOpenChange={setAppearanceOpen}
        >
          <div className="mb-5 flex items-center gap-4">
            <ProfileAvatar
              profile={{
                name: profile.name,
                surname: profile.surname,
                avatar_url: profile.avatar_url,
                color_code: colorForm.colorCode,
                pattern_type: colorForm.patternType,
              }}
              size={64}
            />
            <div>
              <p className="text-sm font-medium text-ink">Profile pattern</p>
            </div>
          </div>

          <div className="mb-4">
            <label className="label-text">Colour</label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLOR_PALETTE.map(hex => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => pickColorSwatch(hex)}
                  aria-label={`Choose ${hex}`}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-canvas-raised transition-transform hover:scale-105 ${
                    colorForm.colorCode === hex ? 'ring-ink' : 'ring-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="label-text">Pattern</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => pickPatternType(null)}
                aria-label="No pattern"
                title="None"
                className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-canvas-raised transition-transform hover:scale-105 ${
                  !colorForm.patternType ? 'ring-ink' : 'ring-transparent'
                }`}
                style={{ backgroundColor: colorForm.colorCode }}
              />
              {PATTERN_TYPES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickPatternType(key)}
                  aria-label={label}
                  title={label}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-canvas-raised transition-transform hover:scale-105 ${
                    colorForm.patternType === key ? 'ring-ink' : 'ring-transparent'
                  }`}
                  style={{ backgroundColor: colorForm.colorCode, ...patternBackgroundStyle(key, colorForm.colorCode, 10) }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={saveAppearance} disabled={colorSaving || !isColorDirty} className="btn-primary">
              {colorSaving ? 'Saving…' : colorJustSaved ? 'Saved.' : 'Update'}
            </button>
            <button type="button" onClick={cancelAppearance} disabled={!isColorDirty || colorSaving} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={surpriseMe} disabled={surprising} className="btn-secondary">
              {surprising ? 'Picking…' : 'Surprise me!'}
            </button>
            {colorMsg && (
              <span className={`text-xs font-medium ${colorMsg.type === 'error' ? 'text-flagRed' : 'text-flagAmber'}`}>
                {colorMsg.text}
              </span>
            )}
          </div>
        </AccordionSection>
      )}

      {/* ── Notification preferences (own account only) ─────── */}
      {isOwnAccount && (
        <AccordionSection title="Notifications">
          <div className="flex items-center justify-between border-b border-slate-line pb-3">
            <p className="text-sm font-medium text-ink">All notifications</p>
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

      {/* ── Delete account (own account only) ────────────────── */}
      {isOwnAccount && (
        <AccordionSection title="Delete Account" danger>
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
