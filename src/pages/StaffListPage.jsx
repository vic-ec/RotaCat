import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar, { StatusBadge, StatusPicker } from '../components/ProfileAvatar'
import ClearableInput from '../components/ClearableInput'
import PageTabs from '../components/PageTabs'
import PageHeader from '../components/PageHeader'
import { ToolbarFacet } from '../components/Toolbar'
import FilterPanel from '../components/FilterPanel'
import Tag from '../components/Tag'
import { ApprovalRow, SelectAllRow } from '../components/ListRow'
import BulkActionBar from '../components/BulkActionBar'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { formatPhoneDisplay, phoneTelHref, phoneSmsHref, phoneWhatsAppHref } from '../lib/phone'
import { msTeamsChatHref, msTeamsCallHref } from '../lib/msTeams'
import {
  defaultHoursForCategory, defaultSwapGroupForCategory, annualLeaveDaysForCategory, OT_SUBTYPE_LABELS,
} from '../lib/staffDefaults'
import { applyHoursChange } from '../lib/internRotations'
import { Eye, CircleCheck, CircleX } from 'lucide-react'

// ── Display label maps ────────────────────────
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
  hours: 'Hours change',
  deletion: 'Account deletion',
}

// 'hours' requests store a JSON-encoded {contract_type, subtype} in both
// current_value and requested_value (role/category requests just store the
// plain string) — renders either shape into a short human label.
function formatRequestValue(value, requestType) {
  if (requestType !== 'hours' || !value) return value
  try {
    const { contract_type, subtype } = JSON.parse(value)
    const hoursLabel = contract_type === 'Junior_Doctor_Overtime' ? 'OT' : 'EC'
    return subtype ? `${hoursLabel} (${OT_SUBTYPE_LABELS[subtype] || subtype})` : hoursLabel
  } catch {
    return value
  }
}

const PERMISSION_LABELS = { admin: 'Admin', super_admin: 'Super-admin' }

// five_eighths and Junior Doctor Overtime (formerly psych_overtime) both
// get a tag — full shows nothing extra. The OT tag matters more than it
// used to: COSMOPsych retiring as a category (2026-08) means a COSMO/
// Intern's category no longer shows EC vs OT at a glance the way it did
// when COSMOPsych was its own category — this tag is now the only
// per-row indicator of that distinction in this list.
const CONTRACT_TAG_LABEL = { five_eighths: '⅝', Junior_Doctor_Overtime: 'OT' }
const CONTRACT_TAG_TITLE = { five_eighths: 'Part-time (⅝ contract)', Junior_Doctor_Overtime: 'Junior Doctor Overtime' }

// "OT" alone, or "OT · LRCHC" once a subtype has been assigned (via the
// Intern Rotations Planner or the Accounts page Hours selector).
function contractTagText(person) {
  const base = CONTRACT_TAG_LABEL[person.contract_type]
  if (!base) return null
  if (person.contract_type === 'Junior_Doctor_Overtime' && person.psych_subcategory) {
    return `${base} · ${OT_SUBTYPE_LABELS[person.psych_subcategory] || person.psych_subcategory}`
  }
  return base
}

const SORT_MODE_KEY = 'rotacat:staffSortMode'
const AZ_DIRECTION_KEY = 'rotacat:staffAzDirection'

// ── Sort/group ───────────────────────────
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

// Search + Sort + Filter, all on one row at a fixed 30px control height —
// the All Staff tab's own toolbar layout, extracted so Pending Approvals
// and User Requests can reuse it exactly rather than the generic Toolbar
// component, whose mobile view collapses Sort+Filter into a single
// "Filters" sheet trigger instead of keeping them as two always-visible
// buttons. `desktop` picks which breakpoint's copy this instance renders
// (both are mounted, only one ever visible via CSS — same pattern as the
// accounts tab's own mobile/desktop toolbar pair below).
function CompactToolbarRow({ searchValue, onSearchChange, searchPlaceholder, sortFacet, filterFacet, clearActive, onClearAll, desktop = false, className = '' }) {
  return (
    <div className={`${desktop ? 'hidden items-center gap-2 md:flex' : 'flex items-center gap-2 md:hidden'} ${className}`}>
      <div className={desktop ? 'w-80 flex-shrink-0' : 'min-w-0 flex-1'}>
        <ClearableInput
          type="text"
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="input-field h-[30px] py-1"
          clearLabel="Clear search"
          icon={<SearchIcon className="h-4 w-4" />}
        />
      </div>
      <ToolbarFacet {...sortFacet} />
      <ToolbarFacet {...filterFacet} />
      {clearActive && (
        <button
          onClick={onClearAll}
          aria-label="Clear all filters"
          title="Clear all filters"
          className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-accent/25 bg-canvas text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-accent active:text-white"
        >
          <CircleX className="h-4 w-4" />
        </button>
      )}
    </div>
  )
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

// A single promoted contact action, inline in the desktop table's Actions
// column — message/call/email get one-click icon buttons here instead of
// living only behind the kebab, per a UX review of the Staff list ("direct
// icons for quick use, kebab for less common actions"). Renders a real
// `<a>` when there's somewhere to go (so it behaves like any other link —
// middle-click, "open in new tab", etc. all work); falls back to a button
// that surfaces the existing missing-contact-detail toast otherwise. The
// kebab is left fully intact alongside these for WhatsApp and Grant admin,
// which don't have a natural single icon of their own.
function RowActionIcon({ icon, href, title, onMissing }) {
  const className = 'flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink'
  if (href) {
    return (
      <a href={href} title={title} aria-label={title} onClick={e => e.stopPropagation()} className={className}>
        {icon}
      </a>
    )
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={e => { e.stopPropagation(); onMissing() }}
      className={className}
    >
      {icon}
    </button>
  )
}

// One of the mobile detail sheet's four icon-only actions (Message/Call/
// Email/View Account) — a generously-sized touch target (48px tall) with
// visible pressed feedback, since three of these hand off to another app
// entirely and a user should feel their tap land before that happens.
function SheetActionButton({ icon, label, href, onClick, onMissing }) {
  const className = 'flex h-12 flex-1 items-center justify-center rounded-lg border border-slate-line text-ink-light transition-all active:scale-95 active:border-accent/40 active:bg-canvas-sunken active:text-ink'
  if (href) {
    return (
      <a href={href} title={label} aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={className}>
        {icon}
      </a>
    )
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={e => { e.stopPropagation(); onClick ? onClick() : onMissing() }}
      className={className}
    >
      {icon}
    </button>
  )
}

// One row of the Pending-approval list. Selection checkbox feeds the bulk
// action bar above the list; clicking anywhere in the row navigates to the
// dedicated review page rather than expanding an inline panel — editing a
// pending registration's details happens there, including its mobile
// number, which is left out of this collapsed row to keep it scannable.
// Built on the shared ApprovalRow template (same shell Leave Requests
// uses) — the standalone "view" icon this used to also carry was dropped
// since the row click already goes to the exact same place
// (docs/design/layout-spec.md §7/§13).
function PendingApprovalRow({ person, email, checked, onToggleCheck, approveAccount, rejectAccount, onEdit }) {
  // Doctors show their category (Registrar, MO, …) rather than the "Doctor"
  // role badge — locum/clerk have no meaningful category, so they keep the
  // role badge instead.
  const secondaryLabel = person.role === 'doctor'
    ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
    : (ROLE_LABELS[person.role] || person.role)
  const registeredDate = person.created_at?.slice(0, 10).split('-').reverse().join('-')
  const registeredTime = person.created_at?.slice(11, 16)
  const fullName = `${person.name ? `${person.name} ` : ''}${person.surname}`

  return (
    <ApprovalRow
      checked={checked}
      onToggleCheck={onToggleCheck}
      selectLabel={`Select ${fullName}`.trim()}
      avatar={<ProfileAvatar profile={person} size={32} />}
      name={fullName}
      tag={secondaryLabel && <Tag variant="role">{secondaryLabel}</Tag>}
      meta={
        <>
          Registered {registeredDate} at {registeredTime} with{' '}
          <span className="font-medium text-accent">{email || '—'}</span>
          {person.email_verified && (
            <CircleCheck title="Email verified" className="ml-1 inline h-3.5 w-3.5 align-text-bottom text-success" />
          )}
        </>
      }
      onApprove={() => approveAccount(person)}
      onReject={() => rejectAccount(person.id)}
      onClick={() => onEdit(person.id)}
    />
  )
}

export default function StaffListPage() {
  const { isAdmin, canViewStaffList, isSuperAdmin, user, setMyActiveStatus } = useAuth()
  // Clerks, Locums, and MO/Registrar doctors are all read-only for account
  // management, but the mobile Quick Actions menu (Message/Call/Mail) is
  // pure contact info -- they all need that same access (see AuthContext's
  // canViewStaffList for the shared role/category rule this mirrors).
  // Account-settings navigation and admin-granting stay isAdmin/isSuperAdmin
  // only, unaffected by this.
  const canContact = canViewStaffList
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState('accounts') // 'accounts' | 'pending'
  const [activeAccounts, setActiveAccounts] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPendingIds, setSelectedPendingIds] = useState(new Set())
  // 'asc' = oldest first (the server's own default order), 'desc' = newest first.
  const [pendingSortDirection, setPendingSortDirection] = useState('asc')
  const [togglingId, setTogglingId] = useState(null)
  const [togglingAdminId, setTogglingAdminId] = useState(null)
  const [emailById, setEmailById] = useState({})
  const [leaveProfileIds, setLeaveProfileIds] = useState(new Set())
  // role/category/status/isAdmin are each a Set of selected values — empty
  // means "All" for that dimension (see FilterPanel.jsx). Multi-select: a
  // viewer can filter to e.g. "Registrar OR MO" within one dimension.
  const [accountFilters, setAccountFilters] = useState({
    q: '', role: new Set(), category: new Set(), status: new Set(), isAdmin: new Set(),
  })
  const [accountRequests, setAccountRequests] = useState([])
  const [requestActioningId, setRequestActioningId] = useState(null)
  const [selectedRequestIds, setSelectedRequestIds] = useState(new Set())
  // 'asc' = oldest first (the server's own default order), 'desc' = newest first.
  const [requestsSortDirection, setRequestsSortDirection] = useState('asc')

  // Approvals/User Requests toolbars — each view gets its own search text
  // and role filter, independent of the accounts tab's own accountFilters.
  // Popover open/anchor state now lives inside the shared Toolbar component.
  const [pendingSearchQuery, setPendingSearchQuery] = useState('')
  const [pendingRoleFilter, setPendingRoleFilter] = useState('all')

  const [requestsSearchQuery, setRequestsSearchQuery] = useState('')
  const [requestsRoleFilter, setRequestsRoleFilter] = useState('all')

  // Sort / group — persisted locally so it doesn't reset every visit
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem(SORT_MODE_KEY) || 'category' } catch { return 'category' }
  })
  useEffect(() => {
    try { localStorage.setItem(SORT_MODE_KEY, sortMode) } catch { /* ignore */ }
  }, [sortMode])

  // A-Z sort direction — folded into the same flat Sort facet as
  // category/role (see sortFacetOptions below) rather than its own
  // cascading secondary popover.
  const [azDirection, setAzDirection] = useState(() => {
    try { return localStorage.getItem(AZ_DIRECTION_KEY) || 'asc' } catch { return 'asc' }
  })
  useEffect(() => {
    try { localStorage.setItem(AZ_DIRECTION_KEY, azDirection) } catch { /* ignore */ }
  }, [azDirection])

  // ── Selector switch: Quick Sort / Filter ──
  // One shared set of state/popovers for both breakpoints — mobile and
  // desktop each render their own copy of the trigger buttons (shown/hidden
  // via CSS, not conditional rendering, so both exist in the DOM at once,
  // but only one is ever visible/interactive). Quick Sort reads/writes the
  // same sortMode/azDirection state used by buildGroups(); Filter reads/
  // writes the same accountFilters state the grid itself filters on.
  // Search itself is always a plain visible ClearableInput below, same as
  // the Pending Approvals/User Requests tabs' Toolbar search — no
  // click-to-open toggle state needed.

  // Single flat Sort facet — category/role select the mode directly, the
  // two A–Z options fold direction into the same list instead of a nested
  // secondary popover (ToolbarFacet, same shape as every other quick-select
  // pill in the app).
  const sortFacetValue = sortMode === 'az' ? (azDirection === 'desc' ? 'az_desc' : 'az_asc') : sortMode
  const sortFacetOptions = [
    { value: 'category', label: 'Category' },
    { value: 'role', label: 'Role' },
    { value: 'az_asc', label: 'A–Z ascending' },
    { value: 'az_desc', label: 'Z–A descending' },
  ]
  function handleSortFacetChange(value) {
    if (value === 'az_asc') { setSortMode('az'); setAzDirection('asc') }
    else if (value === 'az_desc') { setSortMode('az'); setAzDirection('desc') }
    else setSortMode(value)
  }

  // Per-dimension setter for the Filter panel — each group's onChange gets
  // its own setter bound to that dimension's key, rather than the panel
  // needing to know accountFilters' shape.
  function setAccountFilterDimension(key, nextSet) {
    setAccountFilters(f => ({ ...f, [key]: nextSet }))
  }

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

  // Mobile row tap opens this bottom sheet (contact details + one-tap
  // actions) instead of navigating straight to the account page — long
  // press/kebab still open the existing quick-action popover below.
  const [detailSheetPerson, setDetailSheetPerson] = useState(null)
  const detailSheetRef = useRef(null)
  useDismissablePopover(!!detailSheetPerson, () => setDetailSheetPerson(null), detailSheetRef)

  // Long-press (touch and hold) on a row also opens the quick-action menu,
  // alongside the existing kebab tap. `longPressFiredRef` suppresses the
  // click-to-navigate that would otherwise fire on release.
  const longPressTimerRef = useRef(null)
  const longPressFiredRef = useRef(false)
  function handleRowPointerDown(e, person) {
    if (!canContact || e.pointerType !== 'touch') return
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
    // Mobile-only entry point (desktop rows have their own onClick that
    // opens the slide-over panel) — a tap opens the contact/detail sheet
    // rather than navigating straight to the account page; "View Account"
    // inside the sheet is the new path to that full page.
    setDetailSheetPerson(person)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is redefined every render; including it would refetch in a loop
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
            .select('*, requester:profile_id(name, surname, role, category, avatar_url, color_code, pattern_type)')
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

  // Role/category/admin-flag edits now happen on the dedicated pending-review
  // page (Kebab → Edit) and persist straight to the profiles row, so approval
  // itself just finalizes whatever is already saved there — no local
  // editData override to reconcile here anymore.
  async function approveOne(profile) {
    const role = profile.role || 'doctor'
    const rawCategory = profile.category || null
    const category =
      role === 'doctor' ? rawCategory :
      role === 'locum'  ? (['MO', 'Registrar'].includes(rawCategory) ? rawCategory : null) :
      null
    const isAdminFlag = role === 'doctor' ? (profile.is_admin ?? false) : false

    const finalContractType = profile.contract_type || 'full'
    const hours = defaultHoursForCategory(category, finalContractType)
    const swapGroup = defaultSwapGroupForCategory(category)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('profiles').update({
      is_approved:  true,
      is_active:    true,
      role,
      category:     category || null,
      contract_type: finalContractType,
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
      return false
    }

    const leaveDays = annualLeaveDaysForCategory(category)
    if (leaveDays !== null) {
      await supabase.from('annual_leave_balances').upsert(
        { profile_id: profile.id, year: new Date().getFullYear(), days_allotted: leaveDays },
        { onConflict: 'profile_id,year' }
      )
    }
    return true
  }

  async function approveAccount(profile) {
    if (await approveOne(profile)) loadAll()
  }

  async function rejectOne(profileId) {
    const { error } = await supabase.from('profiles').update({
      is_approved: false,
      is_active: false,
      is_rejected: true,
    }).eq('id', profileId)

    if (error) {
      console.error('Reject failed:', error.message)
      alert('Could not reject account: ' + error.message)
      return false
    }
    return true
  }

  async function rejectAccount(profileId) {
    if (await rejectOne(profileId)) loadAll()
  }

  function togglePendingSelected(id) {
    setSelectedPendingIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAllPending() {
    setSelectedPendingIds(prev =>
      prev.size === pending.length ? new Set() : new Set(pending.map(p => p.id))
    )
  }

  async function bulkApprovePending() {
    const targets = pending.filter(p => selectedPendingIds.has(p.id))
    setSelectedPendingIds(new Set())
    await Promise.all(targets.map(approveOne))
    loadAll()
  }

  async function bulkRejectPending() {
    const ids = Array.from(selectedPendingIds)
    setSelectedPendingIds(new Set())
    await Promise.all(ids.map(rejectOne))
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
      const patch = { category: request.requested_value }
      // A locum's category is normally just an MO/Registrar eligibility tag
      // (drives which advertised shifts they can claim) and doesn't by
      // itself mean they're becoming a full doctor — but approving one
      // often *does* mean exactly that (e.g. someone who's finished
      // locuming and joined the roster properly), so ask rather than
      // silently leaving them a Locum or silently promoting every locum
      // category tag to Doctor.
      const { data: current } = await supabase.from('profiles').select('role').eq('id', request.profile_id).single()
      if (current?.role === 'locum') {
        const name = `${request.requester?.name || ''} ${request.requester?.surname || ''}`.trim() || 'this account'
        const promote = window.confirm(
          `Also change ${name}'s role from Locum to Doctor?\n\nOK = promote to Doctor with category ${request.requested_value}.\nCancel = keep them a Locum, just tagged eligible for ${request.requested_value} shifts.`
        )
        if (promote) patch.role = 'doctor'
      }
      await supabase.from('profiles').update(patch).eq('id', request.profile_id)
    } else if (request.request_type === 'hours') {
      try {
        const { contract_type, subtype } = JSON.parse(request.requested_value)
        await applyHoursChange({
          profileId: request.profile_id,
          category: request.requester?.category,
          contractType: contract_type,
          subtype,
          actorId: user.id,
        })
      } catch (err) {
        alert('Could not apply hours change: ' + err.message)
        setRequestActioningId(null)
        return
      }
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

  function toggleRequestSelected(id) {
    setSelectedRequestIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAllRequests() {
    setSelectedRequestIds(prev =>
      prev.size === accountRequests.length ? new Set() : new Set(accountRequests.map(r => r.id))
    )
  }

  async function bulkApproveRequests() {
    const targets = accountRequests.filter(r => selectedRequestIds.has(r.id))
    setSelectedRequestIds(new Set())
    await Promise.all(targets.map(approveRequest))
  }

  async function bulkRejectRequests() {
    const targets = accountRequests.filter(r => selectedRequestIds.has(r.id))
    setSelectedRequestIds(new Set())
    await Promise.all(targets.map(r => rejectRequest(r)))
  }

  // ── Quick-action popover handlers ────────────────────
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

  // Groups for the multi-select Filter panel — Is Admin only makes sense
  // for an admin viewer (matching the desktop table's own Is Admin column,
  // which is isAdmin-gated too).
  const filterGroups = [
    {
      key: 'role', label: 'Role',
      options: accountRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r })),
      selected: accountFilters.role,
      onChange: next => setAccountFilterDimension('role', next),
    },
    {
      key: 'category', label: 'Category',
      options: accountCategoryOptions.map(c => ({ value: c, label: CATEGORY_LABELS[c] || c })),
      selected: accountFilters.category,
      onChange: next => setAccountFilterDimension('category', next),
    },
    {
      key: 'status', label: 'Status',
      options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
      selected: accountFilters.status,
      onChange: next => setAccountFilterDimension('status', next),
    },
    ...(isAdmin ? [{
      key: 'isAdmin', label: 'Is Admin',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
      selected: accountFilters.isAdmin,
      onChange: next => setAccountFilterDimension('isAdmin', next),
    }] : []),
  ]

  const filteredAccounts = activeAccounts.filter(person => {
    const q = accountFilters.q.trim().toLowerCase()
    if (q) {
      const fullName = `${person.surname || ''} ${person.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (accountFilters.role.size > 0 && !accountFilters.role.has(person.role)) return false
    if (accountFilters.category.size > 0 && !accountFilters.category.has(person.category)) return false
    if (accountFilters.status.size > 0) {
      const statusKey = person.is_active ? 'active' : 'inactive'
      if (!accountFilters.status.has(statusKey)) return false
    }
    if (accountFilters.isAdmin.size > 0) {
      const isAdminKey = person.is_admin ? 'yes' : 'no'
      if (!accountFilters.isAdmin.has(isAdminKey)) return false
    }
    return true
  })

  const accountFiltersActive = Boolean(accountFilters.q) || accountFilters.role.size > 0 ||
    accountFilters.category.size > 0 || accountFilters.status.size > 0 || accountFilters.isAdmin.size > 0

  const groups = buildGroups(filteredAccounts, sortMode, azDirection)

  // ── Approvals/User Requests: search + role filter, same substring-match
  // and role-equality rules as the accounts tab's own filter. ──
  const pendingRoleOptions = [...new Set(pending.map(p => p.role).filter(Boolean))].sort()
  const filteredPending = pending.filter(person => {
    const q = pendingSearchQuery.trim().toLowerCase()
    if (q) {
      const fullName = `${person.surname || ''} ${person.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (pendingRoleFilter !== 'all' && person.role !== pendingRoleFilter) return false
    return true
  })
  const orderedPending = pendingSortDirection === 'asc' ? filteredPending : [...filteredPending].reverse()

  const requestsRoleOptions = [...new Set(accountRequests.map(r => r.requester?.role).filter(Boolean))].sort()
  const filteredRequests = accountRequests.filter(r => {
    const q = requestsSearchQuery.trim().toLowerCase()
    if (q) {
      const fullName = `${r.requester?.surname || ''} ${r.requester?.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (requestsRoleFilter !== 'all' && r.requester?.role !== requestsRoleFilter) return false
    return true
  })
  const displayedRequests = requestsSortDirection === 'asc' ? filteredRequests : [...filteredRequests].reverse()
  // Person/Contact/Status, plus the Is Admin and Actions columns only when
  // they're actually rendered.
  const staffTableCols = 3 + (isAdmin ? 1 : 0) + (canContact ? 1 : 0)

  function clearAllFilters() {
    setAccountFilters({ q: '', role: new Set(), category: new Set(), status: new Set(), isAdmin: new Set() })
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Staff" />
      {/* Sticky header — tab row (admin-only: All Staff / Pending Approvals /
          User Requests, via the shared PageTabs template) plus the Search/
          Sort/Filter toolbar (every viewer, only while on the accounts tab).
          top-0 on both breakpoints: AppLayout's mobile <header> is
          Dashboard-only now (never present on this page), so there's no
          app-bar height to offset below any more — this used to add its
          ~49px, which briefly went stale and hid this whole bar behind a
          gap once that header stopped rendering here.
          The mobile card list's sticky group labels further down are
          offset to clear this bar's own rendered height, which differs by
          role since the tab row only exists for admins — see the
          isAdmin ? 'top-[93px]' : 'top-[50px]' split below.
          No border of its own — PageTabs already supplies the shared
          border-slate-line baseline with a border-accent underline on the
          active tab, so an outer border here would just double up on it. */}
      <div className="sticky top-0 z-20 mb-4 bg-canvas pb-3 pt-2 md:pb-4 md:pt-0">
        {isAdmin && (
          <PageTabs
            tabs={[
              { key: 'accounts', label: 'All Staff' },
              { key: 'pending', label: 'Pending Approvals', badge: pending.length, badgeColor: 'red' },
              { key: 'requests', label: 'User Requests', badge: accountRequests.length },
            ]}
            active={tab}
            onChange={setTab}
            ariaLabel="Staff"
          />
        )}

        {tab === 'accounts' && (
          <>
            {/* Mobile toolbar — Search hugs to fill the remaining width;
                Sort/Filter show icon + label (ToolbarFacet/FilterPanel),
                Clear-all is icon-only, all pinned to the right. Shares
                Sort/Filter state with the desktop toolbar below (only the
                visible copy is ever interactive), so picking anything here
                behaves identically. */}
            <div className={`flex items-center gap-2 md:hidden ${isAdmin ? 'mt-2' : ''}`}>
              <div className="min-w-0 flex-1">
                <ClearableInput
                  type="text"
                  value={accountFilters.q}
                  onChange={e => setAccountFilters(f => ({ ...f, q: e.target.value }))}
                  placeholder="Surname or first name…"
                  className="input-field h-[30px] py-1"
                  clearLabel="Clear search"
                  icon={<SearchIcon className="h-4 w-4" />}
                />
              </div>

              <ToolbarFacet
                icon={<ZapIcon className="h-4 w-4" />}
                label="Sort"
                value={sortFacetValue}
                onChange={handleSortFacetChange}
                options={sortFacetOptions}
                isActive={sortMode !== 'category'}
              />

              <FilterPanel groups={filterGroups} />

              {accountFiltersActive && (
                <button
                  onClick={clearAllFilters}
                  aria-label="Clear all filters"
                  title="Clear all filters"
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-accent/25 bg-canvas text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-accent active:text-white"
                >
                  <CircleX className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Desktop toolbar — Search, Sort, and Filter all at fixed,
                stable widths (not flex-1/hugging) so the row never reflows;
                Sort/Filter always show their icon + label. Clear-all is
                icon-only at the fixed 30x30 size on both breakpoints, and
                (per docs/design/layout-spec.md §5) only rendered once a
                search/filter is actually active. Search is 320px (w-80),
                the spec's standardized desktop search width. */}
            <div className={`hidden items-center gap-2 md:flex ${isAdmin ? 'md:mt-2' : ''}`}>
              <div className="w-80 flex-shrink-0">
                <ClearableInput
                  type="text"
                  value={accountFilters.q}
                  onChange={e => setAccountFilters(f => ({ ...f, q: e.target.value }))}
                  placeholder="Surname or first name…"
                  className="input-field h-[30px] py-1"
                  clearLabel="Clear search"
                  icon={<SearchIcon className="h-4 w-4" />}
                />
              </div>

              <ToolbarFacet
                icon={<ZapIcon className="h-4 w-4" />}
                label="Sort"
                value={sortFacetValue}
                onChange={handleSortFacetChange}
                options={sortFacetOptions}
                isActive={sortMode !== 'category'}
              />

              <FilterPanel groups={filterGroups} />

              {accountFiltersActive && (
                <button
                  onClick={clearAllFilters}
                  aria-label="Clear all filters"
                  title="Clear all filters"
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-accent/25 bg-canvas text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-accent active:text-white"
                >
                  <CircleX className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        )}

        {tab === 'pending' && (() => {
          const sortFacet = {
            icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
            value: pendingSortDirection, onChange: setPendingSortDirection,
            options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }],
            isActive: pendingSortDirection !== 'asc',
          }
          const filterFacet = {
            icon: <ListFilterIcon className="h-4 w-4" />, label: 'Filter',
            value: pendingRoleFilter, onChange: setPendingRoleFilter,
            options: [{ value: 'all', label: 'All roles' }, ...pendingRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))],
            isActive: pendingRoleFilter !== 'all',
          }
          const clearActive = Boolean(pendingSearchQuery) || pendingRoleFilter !== 'all'
          const onClearAll = () => { setPendingSearchQuery(''); setPendingRoleFilter('all') }
          return (
            <>
              <CompactToolbarRow
                className={isAdmin ? 'mt-2' : ''}
                searchValue={pendingSearchQuery}
                onSearchChange={setPendingSearchQuery}
                searchPlaceholder="Search by surname or first name…"
                sortFacet={sortFacet}
                filterFacet={filterFacet}
                clearActive={clearActive}
                onClearAll={onClearAll}
              />
              <CompactToolbarRow
                desktop
                className={isAdmin ? 'md:mt-2' : ''}
                searchValue={pendingSearchQuery}
                onSearchChange={setPendingSearchQuery}
                searchPlaceholder="Search by surname or first name…"
                sortFacet={sortFacet}
                filterFacet={filterFacet}
                clearActive={clearActive}
                onClearAll={onClearAll}
              />
            </>
          )
        })()}

        {tab === 'requests' && (() => {
          const sortFacet = {
            icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
            value: requestsSortDirection, onChange: setRequestsSortDirection,
            options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }],
            isActive: requestsSortDirection !== 'asc',
          }
          const filterFacet = {
            icon: <ListFilterIcon className="h-4 w-4" />, label: 'Filter',
            value: requestsRoleFilter, onChange: setRequestsRoleFilter,
            options: [{ value: 'all', label: 'All roles' }, ...requestsRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))],
            isActive: requestsRoleFilter !== 'all',
          }
          const clearActive = Boolean(requestsSearchQuery) || requestsRoleFilter !== 'all'
          const onClearAll = () => { setRequestsSearchQuery(''); setRequestsRoleFilter('all') }
          return (
            <>
              <CompactToolbarRow
                className={isAdmin ? 'mt-2' : ''}
                searchValue={requestsSearchQuery}
                onSearchChange={setRequestsSearchQuery}
                searchPlaceholder="Search by surname or first name…"
                sortFacet={sortFacet}
                filterFacet={filterFacet}
                clearActive={clearActive}
                onClearAll={onClearAll}
              />
              <CompactToolbarRow
                desktop
                className={isAdmin ? 'md:mt-2' : ''}
                searchValue={requestsSearchQuery}
                onSearchChange={setRequestsSearchQuery}
                searchPlaceholder="Search by surname or first name…"
                sortFacet={sortFacet}
                filterFacet={filterFacet}
                clearActive={clearActive}
                onClearAll={onClearAll}
              />
            </>
          )
        })()}
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {error && (
        <div className="card mb-4 border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">Couldn&apos;t load staff: {error}</p>
        </div>
      )}

      {/* ── Tab: approved accounts with active/inactive toggle ── */}
      {!loading && tab === 'accounts' && (
        <div>
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
                    const inactiveCount = group.items.length - activeCount
                    return (
                    <button
                      onClick={() => toggleGroupCollapsed(group.key)}
                      // Offset to clear the sticky header above it — taller
                      // for admins, who also get the tab row on top of the
                      // toolbar (see the header's own comment for the maths).
                      className={`sticky z-[5] mb-2 flex w-full items-center justify-between rounded bg-canvas-sunken px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-slate-line active:bg-slate-line ${
                        isAdmin ? 'top-[93px]' : 'top-[50px]'
                      }`}
                    >
                      {/* "X active · Y inactive" instead of "X total · Y
                          active" — surfaces the exception (anyone inactive)
                          immediately instead of burying it in a total. */}
                      <span>{group.label} <span className="ml-2 normal-case font-normal">{activeCount} active · {inactiveCount} inactive</span></span>
                      <ChevronDownIcon className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${!collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
                    </button>
                    )
                  })()}
                  {(!group.label || !collapsedGroups[group.key]) && (
                  <div className="card divide-y divide-slate-line overflow-hidden">
                    {group.items.map(person => {
                      // "Doctor · COSMO" rather than category alone — a bare
                      // category read as a status/location to reviewers, and
                      // didn't match the role-badge non-doctors show.
                      const secondaryLabel = person.role === 'doctor'
                        ? `${ROLE_LABELS.doctor}${person.category ? ` · ${CATEGORY_LABELS[person.category] || person.category}` : ''}`
                        : (ROLE_LABELS[person.role] || person.role)
                      const contractTag = contractTagText(person)
                      const isMe = person.id === user?.id
                      return (
                        <div
                          key={person.id}
                          onClick={() => handleRowClick(person)}
                          onPointerDown={e => handleRowPointerDown(e, person)}
                          onPointerUp={cancelLongPress}
                          onPointerLeave={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          onContextMenu={e => { if (canContact) e.preventDefault() }}
                          className={`flex items-center gap-3 px-4 py-1 transition-colors hover:bg-canvas-sunken ${canContact ? 'cursor-pointer no-callout active:bg-slate-line' : ''} ${
                            person.is_active ? '' : 'opacity-60'
                          }`}
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
                            {/* line-clamp-2, not truncate: a long category
                                combo (e.g. "Doctor · COSMO (Psych)") wraps
                                to a second line instead of silently cutting
                                off. */}
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                              <span className="line-clamp-2">{secondaryLabel}</span>
                              {contractTag && (
                                <span
                                  className="flex-shrink-0 rounded bg-canvas-sunken px-1 py-0.5 text-[10px] font-semibold text-ink-muted"
                                  title={CONTRACT_TAG_TITLE[person.contract_type]}
                                >
                                  {contractTag}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 flex-col items-end gap-1">
                            {isAdmin && person.is_admin && (
                              <span className={`flex items-center whitespace-nowrap rounded-md border px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                                person.is_super_admin ? 'border-flagBlue text-flagBlue' : 'border-accent text-accent'
                              }`}>
                                {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                              </span>
                            )}
                            {!person.is_active && (
                              <span className="flex items-center whitespace-nowrap rounded-md border border-flagRed/40 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-flagRed">
                                Inactive
                              </span>
                            )}
                          </div>
                          {canContact && (
                            <button
                              onClick={e => { e.stopPropagation(); toggleQuickActions(person, e.currentTarget) }}
                              aria-label="Quick actions"
                              title="Quick actions"
                              // The visible dot stays small (keeps the row
                              // compact), but the actual tappable area is
                              // expanded to 44px via this invisible ::after
                              // — a real 44px button here would fight the
                              // shorter-row goal by becoming the row's
                              // tallest element instead of the avatar.
                              className="relative flex-shrink-0 rounded p-1.5 text-ink-muted transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
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
              <table className="w-full min-w-[680px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-line bg-canvas-cool text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    <th className="px-2.5 py-2">Person</th>
                    <th className="px-2.5 py-2">Contact</th>
                    <th className="px-2.5 py-2">Status</th>
                    {isAdmin && <th className="px-2.5 py-2">Is Admin</th>}
                    {canContact && <th className="px-2.5 py-2 text-right">Actions</th>}
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
                          <td colSpan={staffTableCols} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
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
                        const contractTag = contractTagText(person)
                        // Same "category if doctor, else role" pick as the mobile
                        // card list and the Pending-approval row — one primary
                        // identity label, not a separate Role column and a
                        // separate Category column competing for attention.
                        const secondaryLabel = person.role === 'doctor'
                          ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
                          : (ROLE_LABELS[person.role] || person.role)
                        const targetEmail = emailById[person.id]
                        const firstNameForMissing = person.name || person.surname || 'this person'
                        return (
                          <tr
                            key={person.id}
                            // Opens as a slide-over panel (state.backgroundLocation)
                            // rather than a full-page navigation — see
                            // AccountSlideOverPanel/App.jsx.
                            onClick={() => isAdmin && navigate(`/account/${person.id}`, { state: { backgroundLocation: location } })}
                            title={isAdmin ? `Open ${person.name || ''} ${person.surname}'s account settings` : undefined}
                            className={`border-b border-slate-line last:border-0 transition-colors hover:bg-canvas-sunken ${!person.is_active ? 'opacity-50' : ''} ${
                              isAdmin ? 'cursor-pointer active:bg-slate-line' : ''
                            }`}
                          >
                            <td className="px-2.5 py-1.5">
                              <div className="flex items-center gap-2.5">
                                <ProfileAvatar profile={person} size={30} className="flex-shrink-0" />
                                <div className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-ink">
                                    {person.name ? `${person.name} ` : ''}{person.surname}
                                  </span>
                                  <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-muted">
                                    <span>{secondaryLabel}</span>
                                    {contractTag && (
                                      <span
                                        className="rounded bg-canvas-sunken px-1 py-0.5 text-[10px] font-semibold text-ink-muted"
                                        title={CONTRACT_TAG_TITLE[person.contract_type]}
                                      >
                                        {contractTag}
                                      </span>
                                    )}
                                    {isAdmin && person.is_admin && (
                                      <span className={`font-semibold uppercase tracking-wide ${person.is_super_admin ? 'text-flagBlue' : 'text-accent'}`}>
                                        {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5 text-ink">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <PhoneIcon className="h-3 w-3 flex-shrink-0 text-ink-muted" />
                                  {formattedPhone ? (
                                    <a
                                      href={phoneTelHref(person.phone)}
                                      onClick={e => e.stopPropagation()}
                                      className="hover:underline"
                                    >
                                      {formattedPhone}
                                    </a>
                                  ) : <span>—</span>}
                                </div>
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <EmailIcon className="h-3 w-3 flex-shrink-0 text-ink-muted" />
                                  {targetEmail && person.email_verified ? (
                                    <a
                                      href={`mailto:${targetEmail}`}
                                      onClick={e => e.stopPropagation()}
                                      className="hover:underline"
                                    >
                                      {targetEmail}
                                    </a>
                                  ) : (
                                    <span>{targetEmail || '—'}</span>
                                  )}
                                  {targetEmail && person.email_verified && (
                                    <CircleCheck title="Email verified" className="h-3 w-3 flex-shrink-0 text-success" />
                                  )}
                                </div>
                              </div>
                            </td>
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
                            {isAdmin && (
                              <td className="px-2.5 py-1.5">
                                {person.role === 'clerk' ? (
                                  <span className="text-[11px] text-ink-muted">—</span>
                                ) : (
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
                                )}
                              </td>
                            )}
                            {canContact && (
                              <td className="px-2.5 py-1.5">
                                <div className="flex items-center justify-end gap-0.5">
                                  <RowActionIcon
                                    icon={<MessageIcon className="h-4 w-4" />}
                                    title="Message (MS Teams)"
                                    href={msTeamsChatHref(targetEmail)}
                                    onMissing={() => contactMissing(firstNameForMissing)}
                                  />
                                  <RowActionIcon
                                    icon={<PhoneIcon className="h-4 w-4" />}
                                    title="Call (MS Teams)"
                                    href={msTeamsCallHref(targetEmail)}
                                    onMissing={() => contactMissing(firstNameForMissing)}
                                  />
                                  <RowActionIcon
                                    icon={<EmailIcon className="h-4 w-4" />}
                                    title="Mail"
                                    href={targetEmail && person.email_verified ? `mailto:${targetEmail}` : null}
                                    onMissing={() => contactMissing(firstNameForMissing)}
                                  />
                                </div>
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
      {/* No breadcrumb here — "← All staff" duplicated the already-active
          "Pending Approvals" tab above it (docs/design/layout-spec.md §4). */}
      {!loading && isAdmin && tab === 'pending' && (
        <div className="mx-auto md:max-w-2xl">
          {pending.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No accounts pending approval.</p>
            </div>
          ) : filteredPending.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No accounts match these filters.</p>
            </div>
          ) : (
            <>
              <BulkActionBar
                count={selectedPendingIds.size}
                actions={[
                  { label: 'Approve selected', onClick: bulkApprovePending },
                  { label: 'Reject selected', onClick: bulkRejectPending, tone: 'danger' },
                ]}
                onCancel={() => setSelectedPendingIds(new Set())}
              />

              <div className="card mb-3 overflow-hidden">
                <SelectAllRow
                  checked={selectedPendingIds.size === pending.length}
                  onToggleCheck={toggleSelectAllPending}
                  selectLabel="Select all pending accounts"
                  active={selectedPendingIds.size > 0}
                />
              </div>

              <div className="space-y-3">
                {orderedPending.map((person) => (
                  <div key={person.id} className="card overflow-hidden">
                    <PendingApprovalRow
                      person={person}
                      email={emailById[person.id]}
                      checked={selectedPendingIds.has(person.id)}
                      onToggleCheck={() => togglePendingSelected(person.id)}
                      approveAccount={approveAccount}
                      rejectAccount={rejectAccount}
                      onEdit={id => navigate(`/staff/pending/${id}`, { state: { backgroundLocation: location } })}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: pending account change requests (admin only) ── */}
      {!loading && isAdmin && tab === 'requests' && (
        <div className="mx-auto md:max-w-2xl">
          {accountRequests.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No account requests pending review.</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No requests match these filters.</p>
            </div>
          ) : (
            <>
              <BulkActionBar
                count={selectedRequestIds.size}
                actions={[
                  { label: 'Approve selected', onClick: bulkApproveRequests },
                  { label: 'Reject selected', onClick: bulkRejectRequests, tone: 'danger' },
                ]}
                onCancel={() => setSelectedRequestIds(new Set())}
              />

              <div className="card overflow-hidden divide-y divide-slate-line">
                <SelectAllRow
                  checked={selectedRequestIds.size === accountRequests.length}
                  onToggleCheck={toggleSelectAllRequests}
                  selectLabel="Select all account requests"
                  active={selectedRequestIds.size > 0}
                />
                {displayedRequests.map((r) => {
                  const isActioning = requestActioningId === r.id
                  const secondaryLabel = r.requester?.role === 'doctor'
                    ? (r.requester?.category ? (CATEGORY_LABELS[r.requester.category] || r.requester.category) : null)
                    : (ROLE_LABELS[r.requester?.role] || r.requester?.role)
                  return (
                    <div key={r.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRequestIds.has(r.id)}
                          onChange={() => toggleRequestSelected(r.id)}
                          aria-label={`Select ${r.requester?.name || ''} ${r.requester?.surname || ''}`.trim()}
                          className="mt-1.5 h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
                        />
                        <ProfileAvatar profile={{ id: r.profile_id, ...r.requester }} size={32} className="mt-0.5 flex-shrink-0" />

                        <div className="min-w-0 flex-1 md:flex md:items-start md:justify-between md:gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-ink text-sm">
                                {r.requester?.name ? `${r.requester.name} ` : ''}{r.requester?.surname || 'Unknown'}
                              </p>
                              {secondaryLabel && <Tag variant="role">{secondaryLabel}</Tag>}
                              <Tag variant="role">{REQUEST_TYPE_LABELS[r.request_type] || r.request_type}</Tag>
                            </div>
                            {r.request_type !== 'deletion' && (
                              <p className="mt-1 text-xs text-ink-light">
                                {formatRequestValue(r.current_value, r.request_type) || '—'} → <span className="font-medium text-ink">{formatRequestValue(r.requested_value, r.request_type)}</span>
                              </p>
                            )}
                            {r.reason && <p className="mt-1 text-xs italic text-ink-muted">&quot;{r.reason}&quot;</p>}
                            <p className="mt-0.5 text-xs text-ink-muted">
                              Requested {r.created_at?.slice(0, 10)}
                            </p>
                            {r.request_type === 'deletion' && (
                              <p className="mt-1 text-xs text-flagAmber">
                                Approving deactivates the account. The auth user itself must still be removed manually in Supabase.
                              </p>
                            )}
                          </div>

                          <div className="mt-3 flex flex-shrink-0 items-center gap-1.5 md:mt-0">
                            <button
                              type="button"
                              disabled={isActioning}
                              onClick={() => approveRequest(r)}
                              title="Approve"
                              aria-label="Approve"
                              className="flex h-8 w-8 items-center justify-center text-accent transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <CircleCheck className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              disabled={isActioning}
                              onClick={() => rejectRequest(r)}
                              title="Reject"
                              aria-label="Reject"
                              className="flex h-8 w-8 items-center justify-center text-flagRed transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <CircleX className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/account/${r.profile_id}`, { state: { backgroundLocation: location } })}
                              title="View request"
                              aria-label="View request"
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-success/40 bg-success-bg text-success transition-colors hover:bg-success/25 active:border-accent active:bg-accent active:text-white"
                            >
                              <Eye className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Per-row quick-action popover — shared by both the mobile and
           desktop kebab triggers, visible to any canContact viewer (admin,
           clerk, locum, or MO/Registrar doctor). iOS Contacts-style:
           anchored to wherever the kebab was pressed (rolling down from a
           row in the top/middle of the screen, up from one near the
           bottom). Message/Call open a second, separate flyout popover
           cascading below that row (see below) rather than expanding in
           place. Mail goes straight to the mail client. Status is set via
           the status badge itself, so it's not duplicated here. */}
      {quickActionPerson && quickActionAnchor && (() => {
        const targetEmail = emailById[quickActionPerson.id]
        const mailHref = targetEmail ? `mailto:${targetEmail}` : null
        const canGrantAdmin = isSuperAdmin && quickActionPerson.role !== 'clerk'

        const menuWidth = 224
        const positionStyle = computeAnchoredPosition(quickActionAnchor, menuWidth)

        function missing() {
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
           whichever row was tapped, always rolling down, its options in a
           lighter color than the root menu's. Message adds a Teams "Chat"
           option below Mobile/WhatsApp; Call adds a Teams "MS Teams" call
           option below Mobile/WhatsApp — both keyed off the person's email
           rather than phone, since that's what Teams itself resolves an
           account by. ── */}
      {quickActionPerson && secondaryFor && secondaryAnchor && (() => {
        const firstName = quickActionPerson.name || quickActionPerson.surname || 'this person'
        const telHref = phoneTelHref(quickActionPerson.phone)
        const smsHref = phoneSmsHref(quickActionPerson.phone)
        const waHref = phoneWhatsAppHref(quickActionPerson.phone)
        const mobileHref = secondaryFor === 'message' ? smsHref : telHref
        const targetEmail = emailById[quickActionPerson.id]
        const teamsHref = secondaryFor === 'message' ? msTeamsChatHref(targetEmail) : msTeamsCallHref(targetEmail)
        const teamsLabel = secondaryFor === 'message' ? 'Chat' : 'MS Teams'

        function missing() {
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
            <QuickActionRow label="Mobile" muted href={mobileHref} onClick={mobileHref ? closeQuickActions : missing()} />
            <QuickActionRow label="WhatsApp" muted href={waHref} external onClick={waHref ? closeQuickActions : missing()} />
            <QuickActionRow label={teamsLabel} muted href={teamsHref} external onClick={teamsHref ? closeQuickActions : missing()} />
          </div>
        )
      })()}

      {/* ── Mobile row-tap detail sheet — profile summary, contact fields,
           and one-tap Message/Call/Email/View Account actions. No dark
           backdrop, matching every other popover/panel in the app —
           closes on the first outside tap (muting whatever's under it) or
           picking an action. ── */}
      {detailSheetPerson && (() => {
        const person = detailSheetPerson
        const secondaryLabel = person.role === 'doctor'
          ? `${ROLE_LABELS.doctor}${person.category ? ` · ${CATEGORY_LABELS[person.category] || person.category}` : ''}`
          : (ROLE_LABELS[person.role] || person.role)
        const formattedPhone = formatPhoneDisplay(person.phone)
        const targetEmail = emailById[person.id]
        const onLeave = leaveProfileIds.has(person.id)
        const statusLabel = !person.is_active ? 'Inactive' : onLeave ? 'On leave' : 'Active'
        const statusColor = !person.is_active ? 'text-flagRed' : onLeave ? 'text-statusAway' : 'text-success'
        const firstNameForMissing = person.name || person.surname || 'this person'

        return (
          <div
            ref={detailSheetRef}
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-slate-line bg-canvas-raised px-5 pb-6 pt-3 shadow-[0_-3px_10px_0_rgba(15,23,42,0.18)] md:hidden"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-line" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink">{person.name ? `${person.name} ` : ''}{person.surname}</p>
                <p className="line-clamp-2 text-sm text-ink-muted">{secondaryLabel}</p>
              </div>
              <span className={`flex-shrink-0 text-sm font-medium ${statusColor}`}>{statusLabel}</span>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-slate-line pt-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-14 flex-shrink-0 text-ink-muted">Mobile</span>
                <span className="min-w-0 truncate text-ink">{formattedPhone || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-14 flex-shrink-0 text-ink-muted">Email</span>
                <span className="min-w-0 truncate text-ink">{targetEmail || '—'}</span>
                {targetEmail && person.email_verified && <CircleCheck className="h-3.5 w-3.5 flex-shrink-0 text-success" />}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <SheetActionButton
                icon={<MessageIcon className="h-5 w-5" />}
                label="Message"
                href={phoneSmsHref(person.phone)}
                onClick={() => setDetailSheetPerson(null)}
                onMissing={() => contactMissing(firstNameForMissing)}
              />
              <SheetActionButton
                icon={<PhoneIcon className="h-5 w-5" />}
                label="Call"
                href={phoneTelHref(person.phone)}
                onClick={() => setDetailSheetPerson(null)}
                onMissing={() => contactMissing(firstNameForMissing)}
              />
              <SheetActionButton
                icon={<EmailIcon className="h-5 w-5" />}
                label="Email"
                href={targetEmail && person.email_verified ? `mailto:${targetEmail}` : null}
                onClick={() => setDetailSheetPerson(null)}
                onMissing={() => contactMissing(firstNameForMissing)}
              />
              <SheetActionButton
                icon={<Eye className="h-5 w-5" />}
                label="View Account"
                onClick={() => { setDetailSheetPerson(null); navigate(`/account/${person.id}`) }}
              />
            </div>
          </div>
        )
      })()}

      {/* ── Missing-contact toast ────────────────────── */}
      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6">
          <div className="rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-raised">{toast}</div>
        </div>
      )}
    </div>
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

// Lightning bolt — the Quick Sort switch's icon.
function ZapIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
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
