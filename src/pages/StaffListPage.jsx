import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar, { StatusBadge, StatusPicker } from '../components/ProfileAvatar'
import ClearableInput from '../components/ClearableInput'
import SelectMenu from '../components/SelectMenu'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { formatPhoneDisplay, phoneTelHref, phoneSmsHref, phoneWhatsAppHref } from '../lib/phone'

// ── Display label maps ─────────────────────────────────────
const CATEGORY_LABELS = {
  MO:             'Medical Officer',
  Registrar:      'Registrar',
  COSMO:          'COSMO',
  COSMOPsych:     'COSMO (Psych)',
  Intern:         'Intern',
  Consultant:     'Consultant',
  Locum:          'Locum',
  // Future values (dormant until Jan 2027)
  EC_COSMO:       'EC COSMO',
  EC_COSMO_Intern:'EC Intern',
  OT_COSMO:       'OT COSMO',
  OT_COSMO_Intern:'OT Intern',
}

const ROLE_LABELS = {
  doctor: 'Doctor',
  locum:  'Locum',
  clerk:  'Clerk',
}

const REQUEST_TYPE_LABELS = {
  role: 'Role change',
  category: 'Category change',
  deletion: 'Account deletion',
}

const ROLE_BADGE = {
  doctor: 'bg-success-bg text-success',
  locum:  'bg-canvas-sunken text-ink-muted',
  clerk:  'bg-flagAmber-bg text-flagAmber',
}

const PERMISSION_LABELS = { admin: 'Admin', super_admin: 'Super-admin' }
const PERMISSION_BADGE = {
  admin: 'bg-accent text-white',
  super_admin: 'bg-flagBlue text-white',
}

// Only five_eighths gets a tag — full and psych_overtime show nothing extra.
const CONTRACT_TAG_LABEL = { five_eighths: '⅝' }

const SORT_MODE_KEY = 'rotacat:staffSortMode'
const AZ_DIRECTION_KEY = 'rotacat:staffAzDirection'
const SORT_MODES = [
  { key: 'category', label: 'Category', Icon: CategoryIcon },
  { key: 'role', label: 'Role', Icon: RoleIcon },
  { key: 'az', label: 'A–Z', Icon: AZIcon },
]

// Category options for the approval edit panel
// Doctor: full clinical set. Locum: MO/Registrar only (drives shift-claim eligibility). Clerk: none.
const CATEGORY_OPTIONS = [
  { value: 'MO',         label: 'Medical Officer' },
  { value: 'Registrar',  label: 'Registrar' },
  { value: 'COSMO',      label: 'COSMO' },
  { value: 'COSMOPsych', label: 'COSMO (Psych)' },
  { value: 'Intern',     label: 'Intern' },
  { value: 'Consultant', label: 'Consultant' },
]
const LOCUM_CATEGORY_OPTIONS = [
  { value: 'MO',        label: 'Medical Officer' },
  { value: 'Registrar', label: 'Registrar' },
]
function categoryOptionsForRole(role) {
  if (role === 'doctor') return CATEGORY_OPTIONS
  if (role === 'locum') return LOCUM_CATEGORY_OPTIONS
  return []
}

// Default hours targets per category (admin can override per individual)
const DEFAULT_HOURS = {
  MO:          { min: 210, max: 246 },
  Registrar:   { min: 210, max: 246 },
  EC_COSMO:    { min: 210, max: 246 },
  OT_COSMO:    { min: 64,  max: 72  },
  COSMO_Psych: { min: 64,  max: 72  },
  Consultant:  { min: 0,   max: 0   },
  Locum:       { min: 0,   max: 0   },
}

const DEFAULT_SWAP_GROUP = {
  MO:          'senior',
  Registrar:   'senior',
  EC_COSMO:    'junior',
  OT_COSMO:    'junior',
  COSMO_Psych: 'junior',
  Consultant:  'senior',
  Locum:       'locum',
}

// ── Sort/group ───────────────────────────────────────────────
const CATEGORY_GROUP_ORDER = ['Consultant', 'Registrar', 'MO', 'COSMO', 'COSMOPsych', 'Intern', 'Locum', 'Clerk']
const ROLE_GROUP_ORDER = ['doctor', 'locum', 'clerk']

function categoryGroupKey(person) {
  if (person.role === 'locum') return 'Locum'
  if (person.role === 'clerk') return 'Clerk'
  return person.category || 'Other'
}
function categoryGroupLabel(key) {
  if (key === 'Locum' || key === 'Clerk' || key === 'Other') return key
  return CATEGORY_LABELS[key] || key
}
function roleGroupLabel(key) {
  return ROLE_LABELS[key] || key
}

function buildGroups(people, sortMode, azDirection = 'asc') {
  if (sortMode === 'az') {
    const dir = azDirection === 'desc' ? -1 : 1
    return [{
      key: 'all',
      label: null,
      items: [...people].sort((a, b) => dir * (a.surname || '').localeCompare(b.surname || '')),
    }]
  }

  const keyFn = sortMode === 'role' ? (p => p.role || 'Other') : categoryGroupKey
  const labelFn = sortMode === 'role' ? roleGroupLabel : categoryGroupLabel
  const order = sortMode === 'role' ? ROLE_GROUP_ORDER : CATEGORY_GROUP_ORDER

  const buckets = new Map()
  for (const person of people) {
    const key = keyFn(person)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(person)
  }
  for (const items of buckets.values()) {
    items.sort((a, b) => (a.surname || '').localeCompare(b.surname || ''))
  }
  const orderedKeys = [...buckets.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  return orderedKeys.map(key => ({ key, label: labelFn(key), items: buckets.get(key) }))
}

// Same horizontal clamping as computeAnchoredPosition, but always rolls
// down — for the Message/Call flyout, which should stay predictable
// (always growing downward from the row you tapped) rather than flipping
// direction depending on where that row happens to sit in the quick-action
// menu itself.
function computeFlyoutPosition(anchorRect, width) {
  const vw = window.innerWidth
  const left = Math.min(Math.max(8, anchorRect.right - width), vw - width - 8)
  return { left, top: anchorRect.bottom + 6 }
}


// One row of the quick-action popover — a link when `href` is set (opens
// the relevant app directly), otherwise a button (toggle an accordion
// section, or show the missing-contact-detail toast). `indent` pushes
// Mobile/WhatsApp rows in under their Message/Call header to read as
// sub-items. `expandable` rows get a chevron matching the Account page's
// convention — down when closed, rotated to point up when `expanded` — and
// go bold while their section is open.
function QuickActionRow({ icon, label, href, external, muted, expandable, expanded, disabled, title, onClick }) {
  const className = `flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken disabled:cursor-not-allowed disabled:opacity-50 ${
    muted ? 'font-normal text-ink-light' : expanded ? 'font-semibold text-ink' : 'font-medium text-ink'
  }`
  const content = (
    <>
      {icon && <span className="flex-shrink-0 text-ink-muted">{icon}</span>}
      <span className="flex-1">{label}</span>
      {expandable && (
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      )}
    </>
  )
  if (href) {
    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={onClick} className={className}>
        {content}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={className}>
      {content}
    </button>
  )
}

// One row of the Pending-approval list, with its own Role/Category edit
// panel. Unlike the app's other expandable surfaces (which just close on an
// outside click via useDismissablePopover), this one is modal-like: while
// open, a full-viewport invisible click-catcher sits behind it so an
// outside click both closes it AND is swallowed by the catcher rather than
// also landing on whatever button happened to be underneath — the template
// to follow for any future expandable panel that should fully block the
// rest of the page while open, as opposed to a lightweight popover/
// accordion. Deliberately no visible scrim tint here (unlike a centered
// dialog's backdrop) — the panel stays in its normal in-flow position right
// under the row, so a dimmed background would just read as the whole page
// going dull rather than as a focused dialog.
function PendingApprovalRow({ person, email, isEditing, editEntry, setEditingId, setEditData, approveAccount, rejectAccount }) {
  const currentRole     = editEntry.role     ?? person.role     ?? 'doctor'
  const currentCategory = editEntry.category ?? person.category ?? ''
  const currentIsAdmin  = editEntry.isAdmin  ?? person.is_admin ?? false

  // Doctors show their category (Registrar, MO, …) rather than the "Doctor"
  // role badge — locum/clerk have no meaningful category, so they keep the
  // role badge instead.
  const secondaryLabel = person.role === 'doctor'
    ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
    : (ROLE_LABELS[person.role] || person.role)
  const registeredDate = person.created_at?.slice(0, 10).split('-').reverse().join('-')
  const registeredTime = person.created_at?.slice(11, 16)

  const actionButtonClass = 'w-[4.5rem] py-1.5 text-center text-xs font-medium rounded'

  return (
    <div className="px-5 py-4">
      <div className="md:flex md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 flex-1">
          {/* Mobile: name · category/role, plain text (line 1) */}
          <p className="text-sm font-medium text-ink md:hidden">
            {person.name ? `${person.name} ` : ''}{person.surname}
            <span className="font-normal text-ink-muted"> · {secondaryLabel}</span>
          </p>

          {/* Desktop: name + pillbox badge */}
          <div className="hidden items-center gap-2 flex-wrap md:flex">
            <p className="font-medium text-ink text-sm">
              {person.name ? `${person.name} ` : ''}{person.surname}
            </p>
            {person.role === 'doctor' ? (
              person.category && (
                <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
                  {CATEGORY_LABELS[person.category] || person.category}
                </span>
              )
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[person.role] || 'bg-canvas-sunken text-ink-muted'}`}>
                {ROLE_LABELS[person.role] || person.role}
              </span>
            )}
          </div>

          {/* Line 2 (both breakpoints) */}
          <p className="mt-0.5 text-xs text-ink-muted">
            Registered {registeredDate} at {registeredTime} with{' '}
            <span className="font-medium text-accent">{email || '—'}</span>
          </p>
        </div>

        {/* Line 3 on mobile, right-aligned column on desktop */}
        <div className="mt-3 flex items-center gap-2 flex-shrink-0 md:mt-0">
          <button
            onClick={() => approveAccount(person)}
            className={`${actionButtonClass} bg-success text-white transition-opacity hover:opacity-80 active:opacity-80`}
          >
            Approve
          </button>
          <button
            onClick={() => rejectAccount(person.id)}
            className={`${actionButtonClass} border border-flagRed text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg`}
          >
            Reject
          </button>
          <button
            onClick={() => setEditingId(isEditing ? null : person.id)}
            className={`${actionButtonClass} border border-accent/50 text-ink-light transition-colors hover:bg-accent-light active:bg-accent-light`}
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Edit panel — modal-like: a full-viewport, invisible click-catcher
          (below, z-40) closes it on any outside click and blocks that click
          from also reaching whatever it landed on, while the panel itself
          (z-50) stays in its normal in-flow position rather than becoming a
          centered dialog. No background tint on the catcher — see the
          component doc comment above for why. */}
      {isEditing && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEditingId(null)} />
          <div className="relative z-50 mt-4 rounded-lg border border-accent/25 bg-canvas-sunken p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Role</label>
                <SelectMenu
                  value={currentRole}
                  onChange={v => setEditData(prev => ({
                    ...prev,
                    [person.id]: { ...prev[person.id], role: v }
                  }))}
                  options={[
                    { value: 'doctor', label: 'Doctor' },
                    { value: 'locum', label: 'Locum' },
                    { value: 'clerk', label: 'Clerk' },
                  ]}
                />
              </div>
              {currentRole === 'doctor' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">Category</label>
                  <SelectMenu
                    value={currentCategory}
                    onChange={v => setEditData(prev => ({
                      ...prev,
                      [person.id]: { ...prev[person.id], category: v || null }
                    }))}
                    options={categoryOptionsForRole(currentRole)}
                  />
                </div>
              )}
              {currentRole === 'doctor' && (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={currentIsAdmin}
                    onChange={e => setEditData(prev => ({
                      ...prev,
                      [person.id]: { ...prev[person.id], isAdmin: e.target.checked }
                    }))}
                    className="h-4 w-4 rounded border-slate-line accent-accent"
                  />
                  Admin
                </label>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function StaffListPage() {
  const { isAdmin, isSuperAdmin, user, setMyActiveStatus } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('accounts') // 'accounts' | 'pending'
  const [activeAccounts, setActiveAccounts] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [togglingId, setTogglingId] = useState(null)
  const [togglingAdminId, setTogglingAdminId] = useState(null)
  const [emailById, setEmailById] = useState({})
  const [leaveProfileIds, setLeaveProfileIds] = useState(new Set())
  const [accountFilters, setAccountFilters] = useState({ q: '', role: 'all', category: 'all', status: 'all', isAdmin: 'all' })
  const [accountRequests, setAccountRequests] = useState([])
  const [requestActioningId, setRequestActioningId] = useState(null)

  // Filters popover — anchored to the Filters button itself, same as the
  // other popovers on this page, instead of a bottom sheet.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filtersAnchor, setFiltersAnchor] = useState(null)
  const [draftFilters, setDraftFilters] = useState(accountFilters)
  const filtersMenuRef = useRef(null)
  useDismissablePopover(filtersOpen, () => closeFiltersSheet(), filtersMenuRef)

  // Sort / group — persisted locally so it doesn't reset every visit
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem(SORT_MODE_KEY) || 'category' } catch { return 'category' }
  })
  useEffect(() => {
    try { localStorage.setItem(SORT_MODE_KEY, sortMode) } catch { /* ignore */ }
  }, [sortMode])

  // A-Z sort direction — its own small popover (ascending/descending) opened
  // from the "A–Z" toggle instead of switching straight to that mode.
  const [azDirection, setAzDirection] = useState(() => {
    try { return localStorage.getItem(AZ_DIRECTION_KEY) || 'asc' } catch { return 'asc' }
  })
  useEffect(() => {
    try { localStorage.setItem(AZ_DIRECTION_KEY, azDirection) } catch { /* ignore */ }
  }, [azDirection])
  const [sortDirectionAnchor, setSortDirectionAnchor] = useState(null)
  const sortDirectionMenuRef = useRef(null)
  useDismissablePopover(!!sortDirectionAnchor, () => setSortDirectionAnchor(null), sortDirectionMenuRef)

  // Collapsed state per group section (keyed by group.key), category/role modes only
  const [collapsedGroups, setCollapsedGroups] = useState({})
  function toggleGroupCollapsed(key) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Per-row quick-action popover (mobile, admin viewers) — anchored to
  // wherever the kebab button was actually pressed, iOS-Contacts-style,
  // rather than a bottom sheet unrelated to the tapped row's position.
  // Message/Call open a second, separate flyout popover (`secondaryFor`)
  // cascading below whichever of those two rows was tapped, rather than
  // expanding in place — it always rolls down and its options render in a
  // lighter color than the root menu's.
  const [quickActionPerson, setQuickActionPerson] = useState(null)
  const [quickActionAnchor, setQuickActionAnchor] = useState(null)
  const [secondaryFor, setSecondaryFor] = useState(null) // null | 'message' | 'call'
  const [secondaryAnchor, setSecondaryAnchor] = useState(null)
  const quickActionMenuRef = useRef(null)
  const quickActionTriggerRef = useRef(null) // the kebab/row currently driving the open menu
  const secondaryMenuRef = useRef(null)

  // A small in-app toast for the missing-contact-detail message — a plain
  // `alert()` triggers the browser's native dialog, which after a couple of
  // repeats offers a "Prevent this page from creating additional dialogs"
  // checkbox; a dismissable in-DOM banner sidesteps that entirely.
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useDismissablePopover(!!quickActionPerson, () => closeQuickActions(), quickActionMenuRef, [quickActionTriggerRef, secondaryMenuRef])

  // Long-press (touch and hold) on a row also opens the quick-action menu,
  // alongside the existing kebab tap. `longPressFiredRef` suppresses the
  // click-to-navigate that would otherwise fire on release.
  const longPressTimerRef = useRef(null)
  const longPressFiredRef = useRef(false)
  function handleRowPointerDown(e, person) {
    if (!isAdmin || e.pointerType !== 'touch') return
    const target = e.currentTarget
    longPressFiredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      toggleQuickActions(person, target)
    }, 550)
  }
  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }
  function handleRowClick(person) {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    if (isAdmin) navigate(`/account/${person.id}`)
  }

  useEffect(() => {
    loadAll()
  }, [isAdmin])

  async function loadAll() {
    setLoading(true)
    setError('')

    const [accountsRes, pendingRes, emailsRes, requestsRes, leaveRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*, approver:approved_by(name, surname)')
        .eq('is_approved', true)
        .order('surname'),
      isAdmin
        ? supabase
            .from('profiles')
            .select('*')
            .eq('is_approved', false)
            .eq('is_rejected', false)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase.rpc('get_staff_emails'),
      isAdmin
        ? supabase
            .from('account_change_requests')
            .select('*, requester:profile_id(name, surname)')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase.rpc('get_current_leave_profile_ids'),
    ])

    if (accountsRes.error) {
      setError(accountsRes.error.message)
    }
    setActiveAccounts(accountsRes.data || [])
    setPending(pendingRes.data || [])
    setAccountRequests(requestsRes.data || [])
    setLeaveProfileIds(new Set((leaveRes.data || []).map(r => r.profile_id)))

    const emailMap = {}
    for (const row of emailsRes.data || []) emailMap[row.id] = row.email
    setEmailById(emailMap)

    setLoading(false)
  }

  async function toggleActive(profileId, currentlyActive) {
    setTogglingId(profileId)
    await supabase.from('profiles')
      .update({ is_active: !currentlyActive })
      .eq('id', profileId)
    await loadAll()
    setTogglingId(null)
  }

  async function toggleAdmin(person) {
    setTogglingAdminId(person.id)
    const { error } = await supabase.from('profiles')
      .update({ is_admin: !person.is_admin })
      .eq('id', person.id)
    if (error) alert(error.message.replace(/^.*?: /, ''))
    await loadAll()
    setTogglingAdminId(null)
  }

  async function approveAccount(profile) {
    const ed = editData[profile.id] || {}
    const role = ed.role ?? profile.role ?? 'doctor'
    const rawCategory = ed.category ?? profile.category ?? null
    const category =
      role === 'doctor' ? rawCategory :
      role === 'locum'  ? (['MO', 'Registrar'].includes(rawCategory) ? rawCategory : null) :
      null
    // Locums can't have admin privileges (same rule as clerks) — the edit
    // panel only exposes the checkbox for doctor, but enforce it here too
    // in case editData carries a stale isAdmin from before switching roles.
    const isAdminFlag = role === 'doctor' ? (ed.isAdmin ?? profile.is_admin ?? false) : false

    const hours    = DEFAULT_HOURS[category]    || { min: 210, max: 246 }
    const swapGroup = DEFAULT_SWAP_GROUP[category] || 'junior'

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('profiles').update({
      is_approved:  true,
      is_active:    true,
      role,
      category:     category || null,
      is_admin:     isAdminFlag,
      min_hours:    hours.min,
      max_hours:    hours.max,
      swap_group:   swapGroup,
      approved_by:  user.id,
      approved_at:  new Date().toISOString(),
    }).eq('id', profile.id)

    if (error) {
      console.error('Approval failed:', error.message)
      alert('Could not approve account: ' + error.message)
      return
    }

    setEditingId(null)
    loadAll()
  }

  async function rejectAccount(profileId) {
  const { error } = await supabase.from('profiles').update({
    is_approved: false,
    is_active: false,
    is_rejected: true,
  }).eq('id', profileId)

  if (error) {
    console.error('Reject failed:', error.message)
    alert('Could not reject account: ' + error.message)
    return
  }
  loadAll()
}

  async function approveRequest(request) {
    setRequestActioningId(request.id)
    const { data: { user } } = await supabase.auth.getUser()

    // Apply the actual change first
    if (request.request_type === 'role') {
      const patch = { role: request.requested_value }
      if (request.requested_value === 'clerk') {
        patch.category = null
      } else if (request.requested_value === 'locum') {
        // Locums can only carry MO/Registrar (drives shift-claim eligibility) — clear otherwise
        const { data: current } = await supabase.from('profiles').select('category').eq('id', request.profile_id).single()
        patch.category = ['MO', 'Registrar'].includes(current?.category) ? current.category : null
      }
      await supabase.from('profiles').update(patch).eq('id', request.profile_id)
    } else if (request.request_type === 'category') {
      await supabase.from('profiles').update({ category: request.requested_value }).eq('id', request.profile_id)
    } else if (request.request_type === 'deletion') {
      // Client-side keys can't delete an auth user directly (needs service role).
      // Deactivate the account now; remove the auth user manually in Supabase if required.
      await supabase.from('profiles').update({ is_active: false, is_approved: false }).eq('id', request.profile_id)
    }

    const { error } = await supabase.from('account_change_requests').update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', request.id)

    if (error) alert('Could not update request: ' + error.message)
    await loadAll()
    setRequestActioningId(null)
  }

  async function rejectRequest(request, notes) {
    setRequestActioningId(request.id)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('account_change_requests').update({
      status: 'rejected',
      admin_notes: notes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', request.id)

    if (error) alert('Could not update request: ' + error.message)
    await loadAll()
    setRequestActioningId(null)
  }

  // ── Quick-action popover handlers ────────────────────────────
  function openQuickActions(person, anchorEl) {
    setQuickActionPerson(person)
    setQuickActionAnchor(anchorEl.getBoundingClientRect())
    setSecondaryFor(null)
    setSecondaryAnchor(null)
    quickActionTriggerRef.current = anchorEl
  }
  function closeQuickActions() {
    setQuickActionPerson(null)
    setQuickActionAnchor(null)
    setSecondaryFor(null)
    setSecondaryAnchor(null)
    quickActionTriggerRef.current = null
  }
  // Pressing the kebab (or long-pressing the row) for the person whose menu
  // is already open closes it, rather than just re-anchoring the same menu.
  function toggleQuickActions(person, anchorEl) {
    if (quickActionPerson?.id === person.id) closeQuickActions()
    else openQuickActions(person, anchorEl)
  }
  // Message/Call open a flyout cascading below that specific row; tapping
  // the same one again closes it, tapping the other swaps to it.
  function toggleSecondary(section, anchorEl) {
    setSecondaryFor(s => {
      if (s === section) { setSecondaryAnchor(null); return null }
      setSecondaryAnchor(anchorEl.getBoundingClientRect())
      return section
    })
  }
  function contactMissing(firstName) {
    setToast(`Sorry, we don't have this contact detail for ${firstName} yet.`)
  }

  // ── Accounts grid: filter options derived from the loaded data ──
  const accountRoleOptions = [...new Set(activeAccounts.map(p => p.role).filter(Boolean))].sort()
  const accountCategoryOptions = [...new Set(activeAccounts.map(p => p.category).filter(Boolean))].sort()

  const filteredAccounts = activeAccounts.filter(person => {
    const q = accountFilters.q.trim().toLowerCase()
    if (q) {
      const fullName = `${person.surname || ''} ${person.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (accountFilters.role !== 'all' && person.role !== accountFilters.role) return false
    if (accountFilters.category !== 'all' && person.category !== accountFilters.category) return false
    if (accountFilters.status !== 'all') {
      const wantActive = accountFilters.status === 'active'
      if (Boolean(person.is_active) !== wantActive) return false
    }
    if (accountFilters.isAdmin !== 'all') {
      const wantAdmin = accountFilters.isAdmin === 'yes'
      if (Boolean(person.is_admin) !== wantAdmin) return false
    }
    return true
  })

  const accountFiltersActive = accountFilters.q || accountFilters.role !== 'all' ||
    accountFilters.category !== 'all' || accountFilters.status !== 'all' || accountFilters.isAdmin !== 'all'
  const sheetFilterCount = ['role', 'category', 'status', 'isAdmin'].filter(k => accountFilters[k] !== 'all').length

  const groups = buildGroups(filteredAccounts, sortMode, azDirection)

  function openFiltersSheet(anchorEl) {
    setDraftFilters(accountFilters)
    setFiltersAnchor(anchorEl.getBoundingClientRect())
    setFiltersOpen(true)
  }
  function closeFiltersSheet() {
    setFiltersOpen(false)
    setFiltersAnchor(null)
  }
  function applyFilters() {
    setAccountFilters(draftFilters)
    closeFiltersSheet()
  }
  function clearSheetFilters() {
    setDraftFilters(f => ({ ...f, role: 'all', category: 'all', status: 'all', isAdmin: 'all' }))
  }
  function clearAllFilters() {
    setAccountFilters({ q: '', role: 'all', category: 'all', status: 'all', isAdmin: 'all' })
  }
  // The reset icon next to the Filters button — clears everything (search
  // included) without opening the popover first, unlike "Clear all" inside
  // it which only resets the dropdown filters.
  function resetFiltersNow() {
    clearAllFilters()
    setDraftFilters({ q: '', role: 'all', category: 'all', status: 'all', isAdmin: 'all' })
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Staff</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-ink-muted">
            {activeAccounts.length} team member{activeAccounts.length === 1 ? '' : 's'}
          </span>
          {isAdmin && (
            <>
              <button
                onClick={() => setTab('pending')}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80 active:opacity-80 ${
                  pending.length > 0 ? 'bg-success-bg text-success' : 'bg-canvas-sunken text-ink-muted opacity-60'
                }`}
              >
                <BellIcon className="h-3.5 w-3.5" />
                {pending.length} pending approval{pending.length === 1 ? '' : 's'}
              </button>
              <button
                onClick={() => setTab('requests')}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80 active:opacity-80 ${
                  accountRequests.length > 0 ? 'bg-flagAmber-bg text-flagAmber' : 'bg-canvas-sunken text-ink-muted opacity-60'
                }`}
              >
                <MailQuestionMarkIcon className="h-3.5 w-3.5" />
                {accountRequests.length} user request{accountRequests.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {error && (
        <div className="card mb-4 border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">Couldn't load staff: {error}</p>
        </div>
      )}

      {/* ── Tab: approved accounts with active/inactive toggle ── */}
      {!loading && tab === 'accounts' && (
        <div>
          {/* Sort/group/Filters + Search — stacked on mobile (selector on
              top, search below), one row on desktop */}
          <div className="mb-4 md:flex md:items-end md:gap-3">
            <div className="flex flex-wrap items-center gap-1.5 md:flex-1">
              <div className="flex h-[42px] w-full gap-1 rounded-lg border border-accent/25 bg-canvas-raised p-1 md:w-auto md:flex-1">
                {SORT_MODES.map(opt => {
                  const isDesc = opt.key === 'az' && sortMode === 'az' && azDirection === 'desc'
                  return (
                    <button
                      key={opt.key}
                      onClick={e => {
                        setSortMode(opt.key)
                        if (opt.key === 'az') setSortDirectionAnchor(e.currentTarget.getBoundingClientRect())
                      }}
                      className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded px-1 text-xs font-medium transition-colors md:flex-none md:px-2.5 ${
                        sortMode === opt.key
                          ? 'bg-accent text-white'
                          : 'text-ink-light hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink'
                      }`}
                    >
                      <opt.Icon {...(opt.key === 'az' ? { flipped: isDesc } : {})} className="h-3.5 w-3.5 flex-shrink-0" />
                      {isDesc ? 'Z–A' : opt.label}
                    </button>
                  )
                })}
                {/* The reset icon replaces the "· N" count text (rather than
                    sitting beside it as its own separate button) — with the
                    count text, this pill outgrew the row's fixed h-[42px]
                    band width on mobile and wrapped the whole row onto two
                    lines. It's a sibling button, not nested inside the
                    "Filters" trigger — a button-in-a-button isn't valid
                    HTML, and stopPropagation keeps its own tap from also
                    toggling the sheet. */}
                <div
                  className={`flex flex-1 items-center gap-1 whitespace-nowrap rounded text-xs font-medium transition-colors md:flex-none ${
                    filtersOpen || sheetFilterCount > 0
                      ? 'bg-accent text-white'
                      : 'text-ink-light hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink'
                  }`}
                >
                  <button
                    onClick={e => openFiltersSheet(e.currentTarget)}
                    className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-1 md:flex-none md:px-2.5"
                  >
                    <ListFilterIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    Filters
                  </button>
                  {sheetFilterCount > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); resetFiltersNow() }}
                      aria-label="Reset filters"
                      title="Reset filters"
                      className="flex-shrink-0 rounded p-1 hover:bg-accent-dark active:bg-accent-dark"
                    >
                      <ResetIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 md:mt-0 md:w-64 md:flex-shrink-0">
              <ClearableInput
                type="text"
                value={accountFilters.q}
                onChange={e => setAccountFilters(f => ({ ...f, q: e.target.value }))}
                placeholder="Surname or first name…"
                className="input-field"
                clearLabel="Clear search"
                icon={<SearchIcon className="h-4 w-4" />}
              />
            </div>
          </div>

          {activeAccounts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No approved accounts yet.</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="mb-3 text-sm text-ink-muted">No accounts match these filters.</p>
              {accountFiltersActive && (
                <button onClick={clearAllFilters} className="btn-secondary">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
            {/* Mobile: stacked rows, grouped by sortMode. Desktop/tablet: full table (below). */}
            <div className="md:hidden">
              {groups.map(group => (
                <div key={group.key} className="mb-4 last:mb-0">
                  {group.label && (() => {
                    const activeCount = group.items.filter(p => p.is_active).length
                    return (
                    <button
                      onClick={() => toggleGroupCollapsed(group.key)}
                      className="sticky top-14 z-[5] mb-2 flex w-full items-center justify-between rounded bg-canvas-sunken px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-slate-line active:bg-slate-line"
                    >
                      <span>{group.label} <span className="ml-2 normal-case font-normal">{group.items.length} total • {activeCount} active</span></span>
                      <ChevronDownIcon className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${!collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
                    </button>
                    )
                  })()}
                  {(!group.label || !collapsedGroups[group.key]) && (
                  <div className="card divide-y divide-slate-line overflow-hidden">
                    {group.items.map(person => {
                      const secondaryLabel = person.role === 'doctor'
                        ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
                        : (ROLE_LABELS[person.role] || person.role)
                      const contractTag = CONTRACT_TAG_LABEL[person.contract_type]
                      const isMe = person.id === user?.id
                      return (
                        <div
                          key={person.id}
                          onClick={() => handleRowClick(person)}
                          onPointerDown={e => handleRowPointerDown(e, person)}
                          onPointerUp={cancelLongPress}
                          onPointerLeave={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          onContextMenu={e => { if (isAdmin) e.preventDefault() }}
                          className={`flex items-center gap-3 px-4 py-2 ${isAdmin ? 'cursor-pointer no-callout' : ''}`}
                        >
                          <div className="relative flex-shrink-0">
                            <ProfileAvatar profile={person} size={40} />
                            <StatusPicker
                              active={person.is_active}
                              onLeave={leaveProfileIds.has(person.id)}
                              size={14}
                              interactive={isMe}
                              onSetActive={isMe ? setMyActiveStatus : undefined}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {person.name ? `${person.name} ` : ''}{person.surname}
                            </span>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                              <span>{secondaryLabel}</span>
                              {contractTag && (
                                <span
                                  className="rounded bg-canvas-sunken px-1 py-0.5 text-[10px] font-semibold text-ink-muted"
                                  title="Part-time (⅝ contract)"
                                >
                                  {contractTag}
                                </span>
                              )}
                            </div>
                          </div>
                          {person.is_admin && (
                            <span className={`flex flex-shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                              person.is_super_admin ? 'border-flagBlue text-flagBlue' : 'border-accent text-accent'
                            }`}>
                              {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                            </span>
                          )}
                          {isAdmin && (
                            <button
                              onClick={e => { e.stopPropagation(); toggleQuickActions(person, e.currentTarget) }}
                              aria-label="Quick actions"
                              title="Quick actions"
                              className="flex-shrink-0 rounded p-1.5 text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
                            >
                              <KebabIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  )}
                </div>
              ))}
            </div>

            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-line bg-canvas-cool text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    <th className="px-2 py-2 w-10"><span className="sr-only">Photo</span></th>
                    <th className="px-2.5 py-2">Surname</th>
                    <th className="px-2.5 py-2">First name</th>
                    <th className="px-2.5 py-2">Role</th>
                    <th className="px-2.5 py-2">Category</th>
                    <th className="px-2.5 py-2">Mobile</th>
                    <th className="px-2.5 py-2">Email</th>
                    <th className="px-2.5 py-2">Status</th>
                    <th className="px-2.5 py-2">Is Admin</th>
                    {isAdmin && <th className="px-2.5 py-2 w-10"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => (
                    <Fragment key={group.key}>
                      {group.label && (() => {
                        const activeCount = group.items.filter(p => p.is_active).length
                        return (
                        <tr
                          onClick={() => toggleGroupCollapsed(group.key)}
                          className="cursor-pointer bg-canvas-sunken transition-colors hover:bg-slate-line active:bg-slate-line"
                        >
                          <td colSpan={isAdmin ? 10 : 9} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                            <div className="flex items-center justify-between">
                              <span>{group.label} <span className="ml-2 normal-case font-normal">{group.items.length} total • {activeCount} active</span></span>
                              <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${!collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
                            </div>
                          </td>
                        </tr>
                        )
                      })()}
                      {(!group.label || !collapsedGroups[group.key]) && group.items.map(person => {
                        const isToggling = togglingId === person.id
                        const formattedPhone = formatPhoneDisplay(person.phone)
                        const contractTag = CONTRACT_TAG_LABEL[person.contract_type]
                        return (
                          <tr
                            key={person.id}
                            onClick={() => isAdmin && navigate(`/account/${person.id}`)}
                            title={isAdmin ? `Open ${person.name || ''} ${person.surname}'s account settings` : undefined}
                            className={`border-b border-slate-line last:border-0 ${!person.is_active ? 'opacity-50' : ''} ${
                              isAdmin ? 'cursor-pointer hover:bg-canvas-sunken' : ''
                            }`}
                          >
                            <td className="px-2 py-1.5">
                              <ProfileAvatar profile={person} size={28} />
                            </td>
                            <td className="px-2.5 py-1.5 font-medium text-ink whitespace-nowrap">{person.surname}</td>
                            <td className="px-2.5 py-1.5 text-ink whitespace-nowrap">{person.name || '—'}</td>
                            <td className="px-2.5 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium ${ROLE_BADGE[person.role] || 'bg-canvas-sunken text-ink-muted'}`}>
                                  {ROLE_LABELS[person.role] || person.role}
                                </span>
                                {person.is_admin && (
                                  <span className={(person.is_super_admin ? PERMISSION_BADGE.super_admin : PERMISSION_BADGE.admin) + ' whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium'}>
                                    {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5 text-ink-light whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                {person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—'}
                                {contractTag && (
                                  <span
                                    className="rounded bg-canvas-sunken px-1 py-0.5 text-[10px] font-semibold text-ink-muted"
                                    title="Part-time (⅝ contract)"
                                  >
                                    {contractTag}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-2.5 py-1.5 text-ink-light whitespace-nowrap">
                              {formattedPhone ? (
                                <a
                                  href={phoneTelHref(person.phone)}
                                  onClick={e => e.stopPropagation()}
                                  className="text-ink-light hover:underline"
                                >
                                  {formattedPhone}
                                </a>
                              ) : '—'}
                            </td>
                            <td className="px-2.5 py-1.5 text-ink-light">{emailById[person.id] || '—'}</td>
                            <td className="px-2.5 py-1.5">
                              <div className="flex items-center gap-1.5">
                                {isAdmin ? (
                                  <>
                                    <button
                                      onClick={e => { e.stopPropagation(); !isToggling && toggleActive(person.id, person.is_active) }}
                                      disabled={isToggling}
                                      title={person.is_active ? 'Click to deactivate' : 'Click to activate'}
                                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                                        person.is_active ? 'bg-accent' : 'bg-slate-line'
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                          person.is_active ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                      />
                                    </button>
                                    {person.is_active && leaveProfileIds.has(person.id) && (
                                      <StatusBadge active onLeave size={14} />
                                    )}
                                  </>
                                ) : (
                                  <StatusBadge active={person.is_active} onLeave={leaveProfileIds.has(person.id)} size={14} />
                                )}
                                <span className={`whitespace-nowrap text-[11px] font-medium ${
                                  !person.is_active ? 'text-flagRed' : leaveProfileIds.has(person.id) ? 'text-ink-muted' : 'text-success'
                                }`}>
                                  {!person.is_active ? 'Inactive' : leaveProfileIds.has(person.id) ? 'On leave' : 'Active'}
                                </span>
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5">
                              {person.role === 'clerk' ? (
                                <span className="text-[11px] text-ink-muted">—</span>
                              ) : isAdmin ? (
                                <button
                                  onClick={e => { e.stopPropagation(); togglingAdminId !== person.id && toggleAdmin(person) }}
                                  disabled={togglingAdminId === person.id || person.is_super_admin}
                                  title={person.is_super_admin ? 'Super-admin — manage from their own Account page' : (person.is_admin ? 'Click to revoke admin' : 'Click to grant admin')}
                                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                    person.is_admin ? 'bg-accent' : 'bg-slate-line'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                      person.is_admin ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              ) : (
                                <span className="text-[11px] text-ink-muted">{person.is_admin ? 'Yes' : '—'}</span>
                              )}
                            </td>
                            {isAdmin && (
                              <td className="px-2.5 py-1.5 text-right">
                                <button
                                  onClick={e => { e.stopPropagation(); toggleQuickActions(person, e.currentTarget) }}
                                  aria-label="Quick actions"
                                  title="Quick actions"
                                  className="rounded p-1.5 text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
                                >
                                  <KebabIcon className="h-4 w-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: pending account approvals (admin only) ── */}
      {!loading && isAdmin && tab === 'pending' && (
        <div className="md:mx-auto md:max-w-2xl">
          <button
            onClick={() => setTab('accounts')}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All staff
          </button>
          {pending.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No accounts pending approval.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-line">
              {pending.map((person) => (
                <PendingApprovalRow
                  key={person.id}
                  person={person}
                  email={emailById[person.id]}
                  isEditing={editingId === person.id}
                  editEntry={editData[person.id] || {}}
                  setEditingId={setEditingId}
                  setEditData={setEditData}
                  approveAccount={approveAccount}
                  rejectAccount={rejectAccount}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: pending account change requests (admin only) ── */}
      {!loading && isAdmin && tab === 'requests' && (
        <div className="md:mx-auto md:max-w-2xl">
          <button
            onClick={() => setTab('accounts')}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All staff
          </button>
          {accountRequests.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No account requests pending review.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-line">
              {accountRequests.map((r) => {
                const isActioning = requestActioningId === r.id
                return (
                  <div key={r.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-ink text-sm">
                            {r.requester?.name ? `${r.requester.name} ` : ''}{r.requester?.surname || 'Unknown'}
                          </p>
                          <span className="rounded-full bg-canvas-sunken px-2 py-0.5 text-xs font-medium text-ink-light">
                            {REQUEST_TYPE_LABELS[r.request_type] || r.request_type}
                          </span>
                        </div>
                        {r.request_type !== 'deletion' && (
                          <p className="mt-1 text-xs text-ink-light">
                            {r.current_value || '—'} → <span className="font-medium text-ink">{r.requested_value}</span>
                          </p>
                        )}
                        {r.reason && <p className="mt-1 text-xs text-ink-muted">"{r.reason}"</p>}
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Requested {r.created_at?.slice(0, 10)}
                        </p>
                        {r.request_type === 'deletion' && (
                          <p className="mt-1 text-xs text-flagAmber">
                            Approving deactivates the account. The auth user itself must still be removed manually in Supabase.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          disabled={isActioning}
                          onClick={() => approveRequest(r)}
                          className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 active:opacity-80 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={isActioning}
                          onClick={() => rejectRequest(r)}
                          className="rounded border border-flagRed px-3 py-1.5 text-xs font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Filters popover — anchored to the Filters button ────── */}
      {filtersOpen && filtersAnchor && (() => {
        const menuWidth = 288
        const positionStyle = computeAnchoredPosition(filtersAnchor, menuWidth)
        return (
          <div
            ref={filtersMenuRef}
            role="dialog"
            aria-label="Filters"
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 rounded-xl border border-slate-line bg-canvas-raised p-4 shadow-raised"
          >
            <div className="space-y-4">
              <div>
                <label className="label-text">Role</label>
                <SelectMenu
                  value={draftFilters.role}
                  onChange={v => setDraftFilters(f => ({ ...f, role: v }))}
                  options={[{ value: 'all', label: 'All' }, ...accountRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))]}
                  alwaysDown
                />
              </div>
              <div>
                <label className="label-text">Category</label>
                <SelectMenu
                  value={draftFilters.category}
                  onChange={v => setDraftFilters(f => ({ ...f, category: v }))}
                  options={[{ value: 'all', label: 'All' }, ...accountCategoryOptions.map(c => ({ value: c, label: CATEGORY_LABELS[c] || c }))]}
                  alwaysDown
                />
              </div>
              <div>
                <label className="label-text">Status</label>
                <SelectMenu
                  value={draftFilters.status}
                  onChange={v => setDraftFilters(f => ({ ...f, status: v }))}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                  alwaysDown
                />
              </div>
              <div>
                <label className="label-text">Is Admin</label>
                <SelectMenu
                  value={draftFilters.isAdmin}
                  onChange={v => setDraftFilters(f => ({ ...f, isAdmin: v }))}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]}
                  alwaysDown
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={clearSheetFilters} className="btn-secondary flex-1">Clear all</button>
              <button onClick={applyFilters} className="btn-primary flex-1">Apply</button>
            </div>
          </div>
        )
      })()}

      {/* ── A–Z sort direction popover ───────────────────────────── */}
      {sortDirectionAnchor && (() => {
        const menuWidth = 160
        const positionStyle = computeAnchoredPosition(sortDirectionAnchor, menuWidth)
        function pick(direction) {
          setSortMode('az')
          setAzDirection(direction)
          setSortDirectionAnchor(null)
        }
        return (
          <div
            ref={sortDirectionMenuRef}
            role="menu"
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 overflow-hidden rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
          >
            <QuickActionRow
              label="A–Z ascending"
              expanded={sortMode === 'az' && azDirection === 'asc'}
              onClick={() => pick('asc')}
            />
            <QuickActionRow
              label="Z–A descending"
              expanded={sortMode === 'az' && azDirection === 'desc'}
              onClick={() => pick('desc')}
            />
          </div>
        )
      })()}

      {/* ── Per-row quick-action popover (mobile, admin viewers) ──
           iOS Contacts-style: anchored to wherever the kebab was pressed
           (rolling down from a row in the top/middle of the screen, up from
           one near the bottom). Message/Call open a second, separate flyout
           popover cascading below that row (see below) rather than expanding
           in place. Mail goes straight to the mail client. Status is set via
           the status badge itself, so it's not duplicated here. */}
      {quickActionPerson && quickActionAnchor && (() => {
        const targetEmail = emailById[quickActionPerson.id]
        const mailHref = targetEmail ? `mailto:${targetEmail}` : null
        const canGrantAdmin = isSuperAdmin && quickActionPerson.role !== 'clerk'

        const menuWidth = 224
        const positionStyle = computeAnchoredPosition(quickActionAnchor, menuWidth)

        function missing(label) {
          return () => { contactMissing(quickActionPerson.name || quickActionPerson.surname || 'this person'); closeQuickActions() }
        }

        return (
          <div
            ref={quickActionMenuRef}
            role="menu"
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 overflow-hidden rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
          >
            <QuickActionRow
              icon={<MessageIcon className="h-5 w-5" />}
              label="Message"
              expandable
              expanded={secondaryFor === 'message'}
              onClick={e => toggleSecondary('message', e.currentTarget)}
            />
            <QuickActionRow
              icon={<PhoneIcon className="h-5 w-5" />}
              label="Call"
              expandable
              expanded={secondaryFor === 'call'}
              onClick={e => toggleSecondary('call', e.currentTarget)}
            />
            <QuickActionRow
              icon={<EmailIcon className="h-5 w-5" />}
              label="Mail"
              href={mailHref}
              onClick={mailHref ? closeQuickActions : missing('Mail')}
            />
            {canGrantAdmin && (
              <QuickActionRow
                label={quickActionPerson.is_admin ? 'Set admin · Revoke' : 'Set admin · Grant'}
                disabled={quickActionPerson.is_super_admin}
                title={quickActionPerson.is_super_admin ? 'Super-admin — manage from their own Account page' : undefined}
                onClick={() => { if (!quickActionPerson.is_super_admin) { toggleAdmin(quickActionPerson); closeQuickActions() } }}
              />
            )}
          </div>
        )
      })()}

      {/* ── Message/Call flyout — a separate popover cascading below
           whichever row was tapped, always rolling down, its two options in
           a lighter color than the root menu's. ── */}
      {quickActionPerson && secondaryFor && secondaryAnchor && (() => {
        const firstName = quickActionPerson.name || quickActionPerson.surname || 'this person'
        const telHref = phoneTelHref(quickActionPerson.phone)
        const smsHref = phoneSmsHref(quickActionPerson.phone)
        const waHref = phoneWhatsAppHref(quickActionPerson.phone)
        const mobileHref = secondaryFor === 'message' ? smsHref : telHref

        function missing(label) {
          return () => { contactMissing(firstName); closeQuickActions() }
        }

        const menuWidth = 176
        const positionStyle = computeFlyoutPosition(secondaryAnchor, menuWidth)

        return (
          <div
            ref={secondaryMenuRef}
            role="menu"
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 overflow-hidden rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
          >
            <QuickActionRow label="Mobile" muted href={mobileHref} onClick={mobileHref ? closeQuickActions : missing('Mobile')} />
            <QuickActionRow label="WhatsApp" muted href={waHref} external onClick={waHref ? closeQuickActions : missing('WhatsApp')} />
          </div>
        )
      })()}

      {/* ── Missing-contact toast ──────────────────────────────── */}
      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6">
          <div className="rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-raised">{toast}</div>
        </div>
      )}
    </div>
  )
}


function BellIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8z" />
      <path strokeLinecap="round" d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  )
}

function KebabIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  )
}

// Envelope with a "?" badge (Lucide's "mail-question-mark") — the "user
// requests" pillbox's marker, replacing the earlier double-exclamation mark.
function MailQuestionMarkIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5h-13.5a2.25 2.25 0 00-2.25 2.25v7.5a2.25 2.25 0 002.25 2.25h6.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5a2.25 2.25 0 012.25 2.25v2.318M19.5 4.5L13.06 9.12a2.25 2.25 0 01-2.62 0L3.75 4.5" />
      <circle cx="18.5" cy="18" r="4.5" fill="currentColor" stroke="none" />
      <text x="18.5" y="20.2" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="white" stroke="none">?</text>
    </svg>
  )
}

function ArrowLeftIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

// Price-tag shape — the "group by category" sort icon.
function CategoryIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 3H5a2 2 0 00-2 2v6.5a2 2 0 00.586 1.414l8.5 8.5a2 2 0 002.828 0l6.086-6.086a2 2 0 000-2.828l-8.5-8.5A2 2 0 0011.5 3z" />
      <circle cx="8" cy="8" r="1.3" />
    </svg>
  )
}

// Same two-person mark as the bottom-nav Staff icon — the "group by role" sort icon.
function RoleIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="8" r="3" />
      <path strokeLinecap="round" d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8a3 3 0 100-6M16.5 14c2.5.2 4.5 2.6 4.5 6" />
    </svg>
  )
}

// Small boxed "A/Z" mark — the alphabetical sort icon (flips to Z/A via `flipped`).
function AZIcon({ flipped, ...props }) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <text x="12" y="10.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">
        {flipped ? 'Z' : 'A'}
      </text>
      <text x="12" y="19" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">
        {flipped ? 'A' : 'Z'}
      </text>
    </svg>
  )
}

// Lucide's "rotate-ccw" icon (ISC license, lucide.dev) — used as-is rather
// than a hand-drawn approximation, per lucide-icons/lucide.
function ResetIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

function SearchIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function ListFilterIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M7 12h10M10 18h4" />
    </svg>
  )
}


function ChevronDownIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

function PhoneIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a2.25 2.25 0 00-2.288.573l-.766.766a11.25 11.25 0 01-6.198-6.198l.766-.766a2.25 2.25 0 00.572-2.288L6.65 3.852a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 5.25v1.5z" />
    </svg>
  )
}

function WhatsAppIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.004 2c-5.523 0-10 4.477-10 10 0 1.771.462 3.489 1.34 5.003L2 22l5.11-1.34a9.958 9.958 0 004.894 1.288h.004c5.523 0 10-4.477 10-10s-4.477-10-10-10zm0 18.222h-.003a8.207 8.207 0 01-4.187-1.148l-.3-.178-3.115.817.833-3.037-.196-.312A8.19 8.19 0 013.778 12c0-4.535 3.69-8.222 8.226-8.222 2.197 0 4.26.857 5.815 2.413a8.166 8.166 0 012.408 5.815c0 4.535-3.69 8.216-8.223 8.216z" />
    </svg>
  )
}

function EmailIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function MessageIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  )
}

