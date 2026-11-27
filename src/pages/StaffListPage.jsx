import { leaveTypeInk } from '../lib/leaveMatrix'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar, { StatusBadge, StatusPicker } from '../components/ProfileAvatar'
import PageTabs from '../components/PageTabs'
import Toolbar from '../components/Toolbar'
import FloatingActionMenu from '../components/FloatingActionMenu'
import StatusChangeConfirmModal from '../components/StatusChangeConfirmModal'
import AddStaffModal from '../components/AddStaffModal'
import LocumContactsPanel from '../components/LocumContactsPanel'
import { fetchOpenLocumContacts } from '../lib/locumCover'
import RowActionIcon from '../components/RowActionIcon'
import ExpandAllButton from '../components/ExpandAllButton'
import { allSectionsCollapsed } from '../lib/collapsibleSections'
import RegeneratePasswordModal from '../components/RegeneratePasswordModal'
import AccountRequestReviewDrawer from '../components/AccountRequestReviewDrawer'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { formatPhoneDisplay, phoneTelHref, phoneSmsHref } from '../lib/phone'
import { ContactFlyout, QuickActionRow } from '../components/ContactQuickMenu'
import { formatShortDateRange, todayStr } from '../lib/dateRange'
import { isTempPasswordExpired, tempPasswordExpiresAt, formatExpiryDate } from '../lib/tempPassword'
import TempPasswordIndicator from '../components/TempPasswordIndicator'
import {
  defaultHoursForCategory, defaultSwapGroupForCategory, annualLeaveDaysForCategory, OT_SUBTYPE_LABELS,
} from '../lib/staffDefaults'
import { applyHoursChange, fetchInternRotationsForDoctorIds } from '../lib/internRotations'
import { CATEGORY_LABELS } from '../lib/categoryLabels'
import { setDoctorActiveStatus } from '../lib/staffStatus'
import { Eye, Check, X, FileUser, MessageCircleQuestionMark, CircleCheck, Plus, ShieldAlert } from 'lucide-react'
import InfoPopover from '../components/InfoPopover'
import { fetchProfilesById } from '../lib/changeLog'
import { buildRequestHistory, filterRequestHistory, historyFiltersActive, EMPTY_HISTORY_FILTERS, HISTORY_STATUS_OPTIONS, HISTORY_TYPE_OPTIONS } from '../lib/requestHistory'
import RequestRow from '../components/RequestRow'

// ── Display label maps ────────────────────────
const ROLE_LABELS = {
  doctor: 'Doctor',
  locum:  'Locum',
  clerk:  'Clerk',
}

const REQUEST_TYPE_LABELS = {
  email: 'Email change',
  phone: 'Mobile change',
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

// A single promoted contact action, inline in the desktop table's Actions
// column — message/call/email get one-click icon buttons here instead of
// living only behind the kebab, per a UX review of the Staff list ("direct
// icons for quick use, kebab for less common actions"). Renders a real
// `<a>` when there's somewhere to go (so it behaves like any other link —
// middle-click, "open in new tab", etc. all work); falls back to a button
// that surfaces the existing missing-contact-detail toast otherwise. The
// kebab is left fully intact alongside these for WhatsApp and Update status,
// which don't have a natural single icon of their own.
// Now the shared RowActionIcon (src/components/RowActionIcon.jsx), so every
// table in the app uses the same one.

// One of the mobile detail sheet's four icon-only actions (Message/Call/
// Email/View Account) — a generously-sized touch target (48px tall) with
// visible pressed feedback, since three of these hand off to another app
// entirely and a user should feel their tap land before that happens.
function SheetActionButton({ icon, label, href, onClick, onMissing }) {
  // A filled tray rather than four empty outlines: on the sheet's own
  // `canvas-raised` an outline-only button is a rectangle of nothing, and
  // these four are the only thing on the sheet you can actually do.
  const className = 'flex h-12 flex-1 items-center justify-center rounded-lg border border-slate-line bg-canvas-sunken text-ink-light transition-all hover:border-accent/40 hover:bg-accent-tint hover:text-accent active:scale-95 active:border-accent/40 active:bg-accent-tint active:text-accent'
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
function PendingApprovalRow({ person, approveAccount, rejectAccount, onEdit }) {
  // Doctors show their category (Registrar, MO, …) rather than the "Doctor"
  // role — locum/clerk have no meaningful category, so they show the role.
  const secondaryLabel = person.role === 'doctor'
    ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
    : (ROLE_LABELS[person.role] || person.role)
  const registeredDate = person.created_at?.slice(0, 10).split('-').reverse().join('-')
  const registeredTime = person.created_at?.slice(11, 16)
  const fullName = `${person.name ? `${person.name} ` : ''}${person.surname}`
  const registered = `Account registration, submitted ${registeredDate} · ${registeredTime}`

  return (
    <RequestRow
      person={person}
      name={fullName}
      meta={secondaryLabel}
      onClick={() => onEdit(person.id)}
      actions={[
        { icon: <FileUser className="h-4 w-4" />, title: registered, label: `Review ${fullName}'s registration`, onClick: () => onEdit(person.id) },
        { icon: <Check className="h-4 w-4" />, title: 'Approve', label: `Approve ${fullName}`, tone: 'success', onClick: () => approveAccount(person) },
        { icon: <X className="h-4 w-4" />, title: 'Reject', label: `Reject ${fullName}`, tone: 'danger', onClick: () => rejectAccount(person.id) },
      ]}
    />
  )
}

export default function StaffListPage() {
  const { isAdmin, canViewStaffList } = useAuth()
  // Clerks, Locums, and MO/Registrar doctors are all read-only for account
  // management, but the mobile Quick Actions menu (Message/Call/Mail) is
  // pure contact info -- they all need that same access (see AuthContext's
  // canViewStaffList for the shared role/category rule this mirrors).
  // Account-settings navigation and admin-granting stay isAdmin-only,
  // unaffected by this.
  const canContact = canViewStaffList
  const navigate = useNavigate()
  const location = useLocation()
  // The mobile card list's sticky group labels (below, in the accounts
  // tab's md:hidden branch) need to stick exactly below this sticky
  // header's real rendered height — a hand-picked pixel constant drifts
  // out of sync the moment the header's own content changes (it already
  // has twice: once when the app-bar it used to sit under was removed,
  // again when the toolbar row moved into a FAB below md), leaving either
  // a gap the list shows through or an overlap that hides the label.
  // Measuring it directly removes that whole class of bug. ResizeObserver
  // re-fires on breakpoint changes too, so this stays correct without a
  // separate isAdmin/md branch to keep in sync by hand.
  // getBoundingClientRect(), not entry.contentRect — ResizeObserver's
  // default box is content-box, which EXCLUDES this header's own padding
  // (pt-2/pb-3 etc, part of what it actually paints while stuck). Reading
  // contentRect under-measured the header by exactly that padding, so
  // group labels stuck a padding's-worth too high — into the zone the
  // header's own bottom padding still covers, which its higher z-index
  // then painted over, obscuring the label instead of clearing it.
  const stickyHeaderRef = useRef(null)
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0)
  useEffect(() => {
    const el = stickyHeaderRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setStickyHeaderHeight(el.getBoundingClientRect().height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // 'active' is the landing tab: the people who matter day to day — on
  // the roster now, on leave, or newly created/approved and not yet signed
  // in or still on a temporary password. 'accounts' is the whole book,
  // inactive and finished accounts included. The two share the toolbar
  // and list below; only the predicate differs (see isListTab/tabAccounts).
  // A link can open a specific tab (?tab=pending) — the admin dashboard's
  // Needs attention rows land on the queue they are about.
  // Requests is one tab with three sub-pages (?tab=requests&sub=…), the
  // Planners shape: New Users (sign-ups awaiting approval, rostered locums
  // without an account), User Requests (account change requests) and All
  // Requests (everything decided). Older links (?tab=pending, ?tab=requests
  // on its own) still land on the right sub-page.
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(location.search).get('tab')
    if (!isAdmin) return ['active', 'accounts'].includes(requested) ? requested : 'active'
    if (requested === 'pending' || requested === 'requests') return 'requests'
    return ['active', 'accounts'].includes(requested) ? requested : 'active'
  }) // 'active' | 'accounts' | 'requests'
  const [sub, setSub] = useState(() => {
    const params = new URLSearchParams(location.search)
    const requestedSub = params.get('sub')
    if (['new-users', 'user-requests', 'all-requests'].includes(requestedSub)) return requestedSub
    return params.get('tab') === 'requests' ? 'user-requests' : 'new-users'
  }) // 'new-users' | 'user-requests' | 'all-requests'
  const openRequests = nextSub => { setTab('requests'); setSub(nextSub) }
  const isListTab = tab === 'active' || tab === 'accounts'
  const [activeAccounts, setActiveAccounts] = useState([])
  const [pending, setPending] = useState([])
  // Locums on the roster with no account (admin-only read; see
  // LocumContactsPanel). Counted here for the tab badge and the notice.
  const [locumContactCount, setLocumContactCount] = useState(0)
  // All Requests: everything decided, fetched when that sub-page opens.
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyNames, setHistoryNames] = useState(new Map())
  const [historyFilters, setHistoryFilters] = useState(EMPTY_HISTORY_FILTERS)
  const [historySearch, setHistorySearch] = useState('')
  const [historySort, setHistorySort] = useState('desc')
  const [requestSectionsCollapsed, setRequestSectionsCollapsed] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 'asc' = oldest first (the server's own default order), 'desc' = newest first.
  const [pendingSortDirection, setPendingSortDirection] = useState('asc')
  const [togglingId, setTogglingId] = useState(null)
  const [togglingAdminId, setTogglingAdminId] = useState(null)
  // Pending confirmation for the Status toggle — { profileId, currentlyActive, firstName } | null
  const [statusConfirm, setStatusConfirm] = useState(null)
  // Admin-initiated account creation, and reissuing a password for
  // someone who never received (or lost) the one their account was
  // created with — both run through the admin-staff-credentials Edge
  // Function, since only the service role key can mint credentials.
  const [addStaffOpen, setAddStaffOpen] = useState(false)
  const [regeneratePasswordFor, setRegeneratePasswordFor] = useState(null)
  const [statusConfirmSaving, setStatusConfirmSaving] = useState(false)
  const [emailById, setEmailById] = useState({})
  const [leaveProfileIds, setLeaveProfileIds] = useState(new Set())
  // profile id -> [dateFrom, dateTo] of the approved leave covering today,
  // for the dates under "On leave" in the details sheet, drawn in
  // that leave type's colour. Read straight
  // from leave_requests, so (like the RPC above) it holds only what this
  // viewer's own access lets them see; a miss just shows no dates.
  const [leaveDatesById, setLeaveDatesById] = useState({})
  useEffect(() => {
    let live = true
    const today = todayStr()
    Promise.resolve()
      .then(() => supabase.from('leave_requests').select('profile_id, date_from, date_to, leave_type')
        .eq('status', 'approved').lte('date_from', today).gte('date_to', today))
      .then(res => {
        if (!live || !Array.isArray(res?.data)) return
        const map = {}
        for (const r of res.data) map[r.profile_id] = [r.date_from.slice(0, 10), r.date_to.slice(0, 10), r.leave_type]
        setLeaveDatesById(map)
      })
      .catch(() => {})
    return () => { live = false }
  }, [])
  // profile id -> the date a doctor's rotation timeline runs out, for
  // "Active until" on anyone without an explicit scheduled_inactive_date.
  const [rotationEndById, setRotationEndById] = useState({})
  // Admin-only: the permanent record of deleted accounts (see
  // account_deletion_log). Shown as a collapsed footer on All Staff.
  const [deletionLog, setDeletionLog] = useState([])
  const [deletionLogOpen, setDeletionLogOpen] = useState(false)
  // role/category/status/isAdmin are each a Set of selected values — empty
  // means "All" for that dimension (see FilterPanel.jsx). Multi-select: a
  // viewer can filter to e.g. "Registrar OR MO" within one dimension.
  // signin: 'never' — accounts handed over (a temporary password) that
  // nobody has signed in to yet; the dashboard's row links here with
  // ?signin=never.
  const [accountFilters, setAccountFilters] = useState(() => ({
    q: '', role: new Set(), category: new Set(), status: new Set(), isAdmin: new Set(),
    signin: new Set(isAdmin && new URLSearchParams(location.search).get('signin') === 'never' ? ['never'] : []),
  }))
  // Ids from never_signed_in_profile_ids() (admin only).
  const [neverSignedInIds, setNeverSignedInIds] = useState(() => new Set())
  const [accountRequests, setAccountRequests] = useState([])
  const [requestActioningId, setRequestActioningId] = useState(null)
  // The account_change_requests row currently open in AccountRequestReviewDrawer, or null.
  const [expandedRequestId, setExpandedRequestId] = useState(null)
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
  const detailSheetSwipe = useSwipeToDismiss(() => setDetailSheetPerson(null))

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
      // Anchored to the row for positioning only — not exempted from the
      // menu's outside-tap mute the way the kebab is (see openQuickActions).
      toggleQuickActions(person, target, { anchorIsTrigger: false })
    }, 550)
  }
  // Lifting the finger after a long-press can be followed by a click on the
  // row. With the row no longer exempt from the menu's outside-tap mute,
  // that click would close the menu the instant it opened — cancelling the
  // touchend is what stops the browser synthesizing it.
  function handleRowTouchEnd(e) {
    if (longPressFiredRef.current) e.preventDefault()
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

  // Reload on mount and again whenever `location.key` changes. While an
  // account or pending-approval slide-over is open on top of this page,
  // App.jsx renders the list against its *background* location, so the key
  // holds still; the moment the panel closes (Cancel, Escape, or an action
  // inside it such as deleting the account) the router hands this page a
  // fresh location and the list refetches — otherwise a deleted or
  // deactivated person would stay on screen until a hard refresh. Later
  // loads are silent so the already-visible rows don't flash to "Loading…".
  const hasLoadedOnce = useRef(false)
  useEffect(() => {
    loadAll({ silent: hasLoadedOnce.current })
    hasLoadedOnce.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is redefined every render; including it would refetch in a loop
  }, [isAdmin, location.key])

  async function loadAll({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')

    const [accountsRes, pendingRes, emailsRes, requestsRes, leaveRes, deletionLogRes] = await Promise.all([
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
      isAdmin
        ? supabase
            .from('account_deletion_log')
            .select('id, name, surname, email, role, category, deleted_at, deleted_by, deleter:deleted_by(name, surname)')
            .order('deleted_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
    ])

    if (accountsRes.error) {
      setError(accountsRes.error.message)
    }
    setActiveAccounts(accountsRes.data || [])
    setPending(pendingRes.data || [])
    setAccountRequests(requestsRes.data || [])
    if (isAdmin) fetchOpenLocumContacts().then(rows => setLocumContactCount(rows.length))
    if (isAdmin) {
      Promise.resolve(supabase.rpc('never_signed_in_profile_ids'))
        .then(res => setNeverSignedInIds(new Set(Array.isArray(res?.data) ? res.data.map(r => (typeof r === 'string' ? r : r?.never_signed_in_profile_ids ?? r?.id)) : [])))
        .catch(() => {})
    }
    setLeaveProfileIds(new Set((leaveRes.data || []).map(r => r.profile_id)))
    setDeletionLog(deletionLogRes.data || [])

    const emailMap = {}
    for (const row of emailsRes.data || []) emailMap[row.id] = row.email
    setEmailById(emailMap)

    setLoading(false)

    // Rotation end dates — after the list is on screen, since they only add
    // a date to rows that are already there. A doctor whose last rotation
    // block is open-ended has no end date; one that has already passed
    // isn't an "until" either. Best effort: a failed read just leaves
    // those rows saying "Active".
    try {
      const rotating = (accountsRes.data || []).filter(p => p.category === 'Intern' || p.category === 'Registrar')
      const rotations = await fetchInternRotationsForDoctorIds(rotating.map(p => p.id))
      const today = todayStr()
      const byDoctor = {}
      for (const r of rotations) (byDoctor[r.doctor_id] ||= []).push(r)
      const ends = {}
      for (const [doctorId, rows] of Object.entries(byDoctor)) {
        if (rows.some(r => r.end_date === null)) continue
        const last = rows.map(r => r.end_date).sort().pop()
        if (last >= today) ends[doctorId] = last
      }
      setRotationEndById(ends)
    } catch {
      setRotationEndById({})
    }
  }

  // The date an active account stops being active: an admin-set
  // scheduled_inactive_date first, else the end of their rotation timeline.
  const activeUntilFor = person => person.scheduled_inactive_date || rotationEndById[person.id] || null

  async function toggleActive(profileId, currentlyActive) {
    setTogglingId(profileId)
    await setDoctorActiveStatus(profileId, !currentlyActive)
    await loadAll()
    setTogglingId(null)
  }

  // Status toggle is consequential (excludes/re-includes someone from all
  // future scheduling) — gate the click behind StatusChangeConfirmModal
  // rather than firing toggleActive directly. Confirm runs the exact same
  // update as before; this only adds the extra step in front of it.
  function requestToggleActive(person) {
    setStatusConfirm({
      profileId: person.id,
      currentlyActive: person.is_active,
      firstName: person.name || person.surname || null,
    })
  }

  async function confirmStatusChange() {
    if (!statusConfirm) return
    setStatusConfirmSaving(true)
    await toggleActive(statusConfirm.profileId, statusConfirm.currentlyActive)
    setStatusConfirmSaving(false)
    setStatusConfirm(null)
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
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({
      is_approved: false,
      is_active: false,
      is_rejected: true,
      rejected_by: user?.id ?? null,
      rejected_at: new Date().toISOString(),
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

  // All Requests: sign-ups decided either way, change requests reviewed,
  // locums linked. Reviewer names are looked up once per load.
  async function loadHistory() {
    setHistoryLoading(true)
    const [signupsRes, changesRes, contactsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, role, category, color_code, pattern_type, avatar_url, is_approved, is_rejected, approved_at, approved_by, rejected_at, rejected_by, rejection_note')
        .or('approved_at.not.is.null,is_rejected.eq.true'),
      supabase.from('account_change_requests')
        .select('*, requester:profile_id(name, surname, role, category, avatar_url, color_code, pattern_type)')
        .in('status', ['approved', 'rejected']),
      supabase.from('locum_contacts').select('id, name, surname, linked_profile_id, linked_at').not('linked_profile_id', 'is', null),
    ])
    const items = buildRequestHistory({
      signups: signupsRes.data || [], changeRequests: changesRes.data || [], linkedContacts: contactsRes.data || [],
      typeLabels: REQUEST_TYPE_LABELS, formatValue: formatRequestValue,
    })
    setHistory(items)
    setHistoryNames(await fetchProfilesById(items.map(i => i.reviewedBy)))
    setHistoryLoading(false)
  }
  useEffect(() => {
    if (isAdmin && tab === 'requests' && sub === 'all-requests') loadHistory()
  }, [isAdmin, tab, sub])

  // ── Quick-action popover handlers ────────────────────
  // `anchorIsTrigger`: the kebab is exempt from the menu's outside-tap mute
  // (useDismissablePopover's excludeRefs) so pressing it again toggles the
  // menu shut through its own handler. A long-press anchors to the whole
  // row instead, and exempting *that* let the next tap anywhere on the row
  // slip past the mute and open the detail sheet — the menu needed two
  // taps to close. A long-press menu treats the row like any outside tap.
  function openQuickActions(person, anchorEl, { anchorIsTrigger = true } = {}) {
    setQuickActionPerson(person)
    setQuickActionAnchor(anchorEl.getBoundingClientRect())
    setSecondaryFor(null)
    setSecondaryAnchor(null)
    quickActionTriggerRef.current = anchorIsTrigger ? anchorEl : null
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
  function toggleQuickActions(person, anchorEl, options) {
    if (quickActionPerson?.id === person.id) closeQuickActions()
    else openQuickActions(person, anchorEl, options)
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
  // A desktop row's Message / Call icon opens the same Mobile / WhatsApp
  // flyout on its own, below the icon; pressing it again closes it.
  function openContactFlyout(person, section, el) {
    if (quickActionPerson?.id === person.id && secondaryFor === section && !quickActionAnchor) { closeQuickActions(); return }
    setQuickActionPerson(person)
    setQuickActionAnchor(null)
    setSecondaryFor(section)
    setSecondaryAnchor(el.getBoundingClientRect())
    quickActionTriggerRef.current = el
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
      options: [{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'inactive', label: 'Inactive' }],
      selected: accountFilters.status,
      onChange: next => setAccountFilterDimension('status', next),
    },
    ...(isAdmin ? [{
      key: 'isAdmin', label: 'Is Admin',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
      selected: accountFilters.isAdmin,
      onChange: next => setAccountFilterDimension('isAdmin', next),
    }, {
      key: 'signin', label: 'Sign-in',
      options: [{ value: 'never', label: 'Not signed in yet' }],
      selected: accountFilters.signin,
      onChange: next => setAccountFilterDimension('signin', next),
    }] : []),
  ]

  // Active Staff: anyone currently active (on leave included), plus the
  // accounts that are approved and about to join — a scheduled future start,
  // or a new account that has not replaced its temporary password yet.
  // Deactivated and finished accounts are only on All Staff.
  const tabAccounts = tab === 'active'
    ? activeAccounts.filter(p => p.is_active || p.scheduled_active_date || p.must_change_password)
    : activeAccounts

  const filteredAccounts = tabAccounts.filter(person => {
    const q = accountFilters.q.trim().toLowerCase()
    if (q) {
      const fullName = `${person.surname || ''} ${person.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (accountFilters.role.size > 0 && !accountFilters.role.has(person.role)) return false
    if (accountFilters.category.size > 0 && !accountFilters.category.has(person.category)) return false
    if (accountFilters.status.size > 0) {
      const statusKey = !person.is_active ? 'inactive' : leaveProfileIds.has(person.id) ? 'on_leave' : 'active'
      if (!accountFilters.status.has(statusKey)) return false
    }
    if (accountFilters.isAdmin.size > 0) {
      const isAdminKey = person.is_admin ? 'yes' : 'no'
      if (!accountFilters.isAdmin.has(isAdminKey)) return false
    }
    if (accountFilters.signin.has('never') && !neverSignedInIds.has(person.id)) return false
    return true
  })

  const accountFiltersActive = Boolean(accountFilters.q) || accountFilters.role.size > 0 ||
    accountFilters.category.size > 0 || accountFilters.status.size > 0 || accountFilters.isAdmin.size > 0 ||
    accountFilters.signin.size > 0

  const groups = buildGroups(filteredAccounts, sortMode, azDirection)
  // Only ever true once a viewer has shut every section themselves — an
  // ungrouped list (no labels) never counts as collapsed.
  const allGroupsCollapsed = groups.every(g => g.label) &&
    allSectionsCollapsed(groups, collapsedGroups)

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

  function clearAllFilters() {
    setAccountFilters({ q: '', role: new Set(), category: new Set(), status: new Set(), isAdmin: new Set(), signin: new Set() })
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* An admin's tab row already names where they are (All Staff /
          Pending Approvals / User Requests), so it leads the page on its
          own — a "Staff" title above it only pushed the tabs and the list
          further down a phone screen. A non-admin has no tab row, so this
          title stands in for it: deliberately margin-free, sitting where
          the tabs would be, so the toolbar and list follow immediately
          rather than leaving a void where the admin tabs live. Outside the
          sticky container on purpose — inside it, the title would both
          stay pinned while scrolling and change that container's height,
          which the mobile group-label offsets below are measured against. */}
      {/* Sticky header — tab row (admin-only: All Staff / Pending Approvals /
          User Requests, via the shared PageTabs template) plus the Search/
          Sort/Filter toolbar (every viewer, only while on the accounts tab).
          top-0 on both breakpoints: AppLayout's mobile <header> is
          Dashboard-only now (never present on this page), so there's no
          app-bar height to offset below any more — this used to add its
          ~49px, which briefly went stale and hid this whole bar behind a
          gap once that header stopped rendering here.
          No border of its own — PageTabs already supplies the shared
          border-slate-line baseline with a border-accent underline on the
          active tab, so an outer border here would just double up on it.
          The gap below this bar is bottom PADDING, not margin — a sticky
          element only paints its own padding box; a margin here would leave
          an unpainted band beneath the stuck header that the list scrolls
          straight through, visible as a gap the scrolled-past rows show
          through.
          stickyHeaderRef feeds stickyHeaderHeight (see above), which the
          mobile card list's own sticky group labels use as their `top` —
          measured, not hand-picked, so it can never drift out of sync with
          this bar's actual rendered height again (see that ref's own
          comment for the history of it doing exactly that). */}
      {/* Rostered locums needing accounts live under Account Requests; the
          other tabs carry one line pointing there. */}
      {isAdmin && locumContactCount > 0 && tab !== 'requests' && (
        <button
          type="button"
          onClick={() => openRequests('new-users')}
          data-testid="locum-contacts-notice"
          className="card mb-3 flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 border-l-[3px] border-l-flagAmber px-3 py-2 text-left text-sm text-ink hover:bg-canvas-sunken"
        >
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-flagAmber-bg px-1.5 text-[11px] font-bold text-flagAmber">{locumContactCount}</span>
          <span className="min-w-0 flex-1">{locumContactCount === 1 ? 'Rostered locum needing an account' : 'Rostered locums needing accounts'}</span>
          {/* On its own line on a phone, where it does not fit beside the text. */}
          <span className="basis-full pl-[30px] text-xs font-semibold text-accent sm:basis-auto sm:pl-0">Go to New Users ›</span>
        </button>
      )}
      {/* -mt-2 cancels the pt-2 at rest, so the tabs start at the same
          height as every other page's (Rosters, Team Leave) — the padding
          used to push this page's row 8px lower than theirs. It stays as
          padding rather than going altogether because the bar is sticky:
          once stuck to the top of the screen, those 8px are what keep the
          tab labels off the very edge. */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-20 -mt-2 bg-canvas pb-3 pt-2 md:mt-0 md:pb-4 md:pt-0">
        {/* Every viewer gets Active Staff / All Staff; the two admin queues
            follow for admins only. */}
        <PageTabs
          tabs={[
            { key: 'active', label: 'Active Staff' },
            { key: 'accounts', label: 'All Staff' },
            // Everything outstanding, in one count: red while a person is
            // waiting on an approval, the accent otherwise.
            ...(isAdmin ? [{
              key: 'requests', label: 'Requests',
              badge: pending.length + accountRequests.length + locumContactCount,
              badgeColor: pending.length > 0 ? 'red' : undefined,
            }] : []),
          ]}
          active={tab}
          onChange={setTab}
          ariaLabel="Staff"
        />
        {isAdmin && tab === 'requests' && (
          <div className="mt-2">
            <PageTabs
              size="sub"
              tabs={[
                pending.length > 0
                  ? { key: 'new-users', label: 'New Users', badge: pending.length, badgeColor: 'red' }
                  : { key: 'new-users', label: 'New Users', badge: locumContactCount },
                { key: 'user-requests', label: 'User Requests', badge: accountRequests.length },
                { key: 'all-requests', label: 'All Requests' },
              ]}
              active={sub}
              onChange={setSub}
              ariaLabel="Requests"
            />
          </div>
        )}

        {isListTab && (() => {
          const sortFacets = [{
            key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
            value: sortFacetValue, onChange: handleSortFacetChange,
            options: sortFacetOptions, isActive: sortMode !== 'category',
          }]
          const onSearchChange = q => setAccountFilters(f => ({ ...f, q }))
          return (
            <>
              {/* Below `md` this row is replaced by the Toolbar FAB (§15).
                  The mobile card list's own sticky group labels are offset
                  against this header's height, so they shrink by the row's
                  38px (30px control + mt-2) below `md` too — see their
                  `top-[…]` classes further down. */}
              {/* Add staff leads the row, beside the search, where the
                  Roster page keeps its Create. */}
              <div className="mt-2 hidden items-start gap-2 md:flex">
                {isAdmin && (
                  <button type="button" onClick={() => setAddStaffOpen(true)} className="btn-primary flex-shrink-0 whitespace-nowrap">
                    <Plus className="h-4 w-4" /> Add staff
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <Toolbar
                    className=""
                    searchValue={accountFilters.q}
                    onSearchChange={onSearchChange}
                    searchPlaceholder="Surname or first name…"
                    sortFacets={sortFacets}
                    filterGroups={filterGroups}
                    mobileMode="inline"
                    active={accountFiltersActive}
                    onClearAll={clearAllFilters}
                  />
                </div>
              </div>
              <FloatingActionMenu
                search={{ value: accountFilters.q, onChange: onSearchChange, placeholder: 'Surname or first name…' }}
                sort={{ facets: sortFacets, active: sortMode !== 'category' }}
                filter={{
                  groups: filterGroups,
                  active: accountFiltersActive,
                  onClearAll: clearAllFilters,
                  sheetTitle: 'Filters',
                }}
                /* Same slot the Intern Rotations Matrix puts its own
                   "+ Add doctor" in, rather than a second free-floating
                   FAB competing with this one. */
                primaryAction={isAdmin ? { icon: Plus, label: 'Add staff', onClick: () => setAddStaffOpen(true) } : undefined}
              />
            </>
          )
        })()}

        {tab === 'requests' && sub === 'new-users' && (() => {
          const sortFacets = [{
            key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
            value: pendingSortDirection, onChange: setPendingSortDirection,
            options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }],
            isActive: pendingSortDirection !== 'asc',
          }]
          const filterFacets = [{
            key: 'filter', icon: <ListFilterIcon className="h-4 w-4" />, label: 'Filter',
            value: pendingRoleFilter, onChange: setPendingRoleFilter,
            options: [{ value: 'all', label: 'All roles' }, ...pendingRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))],
            isActive: pendingRoleFilter !== 'all',
          }]
          const clearActive = Boolean(pendingSearchQuery) || pendingRoleFilter !== 'all'
          const onClearAll = () => { setPendingSearchQuery(''); setPendingRoleFilter('all') }
          return (
            <>
              <div className="mx-auto hidden md:block md:max-w-2xl">
                <Toolbar
                  className={isAdmin ? 'mt-2' : ''}
                  searchValue={pendingSearchQuery}
                  onSearchChange={setPendingSearchQuery}
                  searchPlaceholder="Search by surname or first name…"
                  sortFacets={sortFacets}
                  filterFacets={filterFacets}
                  mobileMode="inline"
                  active={clearActive}
                  onClearAll={onClearAll}
                />
              </div>
              {/* Bulk actions live in the list's own select-all header, not
                  a bottom-fixed bar, so the FAB no longer has to hide while
                  rows are checked. */}
              <FloatingActionMenu
                search={{ value: pendingSearchQuery, onChange: setPendingSearchQuery, placeholder: 'Search by surname or first name…' }}
                sort={{ facets: sortFacets, active: pendingSortDirection !== 'asc' }}
                filter={{
                  facets: filterFacets,
                  active: clearActive,
                  onClearAll,
                  sheetTitle: 'Filters',
                }}
              />
            </>
          )
        })()}

        {tab === 'requests' && sub === 'user-requests' && (() => {
          const sortFacets = [{
            key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
            value: requestsSortDirection, onChange: setRequestsSortDirection,
            options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }],
            isActive: requestsSortDirection !== 'asc',
          }]
          const filterFacets = [{
            key: 'filter', icon: <ListFilterIcon className="h-4 w-4" />, label: 'Filter',
            value: requestsRoleFilter, onChange: setRequestsRoleFilter,
            options: [{ value: 'all', label: 'All roles' }, ...requestsRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))],
            isActive: requestsRoleFilter !== 'all',
          }]
          const clearActive = Boolean(requestsSearchQuery) || requestsRoleFilter !== 'all'
          const onClearAll = () => { setRequestsSearchQuery(''); setRequestsRoleFilter('all') }
          return (
            <>
              <div className="mx-auto hidden md:block md:max-w-2xl">
                <Toolbar
                  className={isAdmin ? 'mt-2' : ''}
                  searchValue={requestsSearchQuery}
                  onSearchChange={setRequestsSearchQuery}
                  searchPlaceholder="Search by surname or first name…"
                  sortFacets={sortFacets}
                  filterFacets={filterFacets}
                  mobileMode="inline"
                  active={clearActive}
                  onClearAll={onClearAll}
                />
              </div>
              <FloatingActionMenu
                search={{ value: requestsSearchQuery, onChange: setRequestsSearchQuery, placeholder: 'Search by surname or first name…' }}
                sort={{ facets: sortFacets, active: requestsSortDirection !== 'asc' }}
                filter={{
                  facets: filterFacets,
                  active: clearActive,
                  onClearAll,
                  sheetTitle: 'Filters',
                }}
              />
            </>
          )
        })()}
        {tab === 'requests' && sub === 'all-requests' && (() => {
          const setF = key => next => setHistoryFilters(f => ({ ...f, [key]: next }))
          const categoryOptions = [...new Set(history.map(i => i.category).filter(Boolean))].sort().map(c => ({ value: c, label: CATEGORY_LABELS[c] || c }))
          const roleOptions = [...new Set(history.map(i => i.role).filter(Boolean))].sort().map(r => ({ value: r, label: ROLE_LABELS[r] || r }))
          const reviewerOptions = [...historyNames.values()].map(p => ({ value: p.id, label: `${p.name} ${p.surname}` })).sort((a, b) => a.label.localeCompare(b.label))
          const filterGroups = [
            { key: 'status', label: 'Outcome', options: HISTORY_STATUS_OPTIONS, selected: historyFilters.statuses, onChange: setF('statuses') },
            { key: 'type', label: 'Request type', options: HISTORY_TYPE_OPTIONS, selected: historyFilters.types, onChange: setF('types') },
            { key: 'category', label: 'Category', options: categoryOptions, selected: historyFilters.categories, onChange: setF('categories') },
            { key: 'role', label: 'Role', options: roleOptions, selected: historyFilters.roles, onChange: setF('roles') },
            { key: 'reviewer', label: 'Reviewed by', options: reviewerOptions, selected: historyFilters.reviewers, onChange: setF('reviewers') },
          ]
          const sortFacets = [{
            key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
            value: historySort, onChange: setHistorySort,
            options: [{ value: 'desc', label: 'Newest first' }, { value: 'asc', label: 'Oldest first' }],
            isActive: historySort !== 'desc',
          }]
          const clearActive = historyFiltersActive(historyFilters, historySearch)
          const onClearAll = () => { setHistoryFilters(EMPTY_HISTORY_FILTERS); setHistorySearch('') }
          return (
            <>
              <div className="mx-auto hidden md:block md:max-w-2xl">
                <Toolbar
                  className="mt-2"
                  searchValue={historySearch}
                  onSearchChange={setHistorySearch}
                  searchPlaceholder="Search by surname or first name…"
                  sortFacets={sortFacets}
                  filterGroups={filterGroups}
                  mobileMode="inline"
                  active={clearActive}
                  onClearAll={onClearAll}
                />
              </div>
              <FloatingActionMenu
                search={{ value: historySearch, onChange: setHistorySearch, placeholder: 'Search by surname or first name…' }}
                sort={{ facets: sortFacets, active: historySort !== 'desc' }}
                filter={{ groups: filterGroups, active: clearActive, onClearAll, sheetTitle: 'Filters' }}
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
      {!loading && isListTab && (
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
                      // Sticks flush against the real bottom edge of the
                      // header above (stickyHeaderRef/stickyHeaderHeight,
                      // see that ref's own comment) — measured rather than
                      // a hand-picked constant, so it can't drift out of
                      // sync with that header's actual rendered height
                      // (admin vs non-admin, or any future change to what
                      // renders inside it) the way a fixed px offset here
                      // already has twice before.
                      style={{ top: stickyHeaderHeight }}
                      className="sheen-divider sheen-pinned sticky z-[5] mb-2 transition-[filter] hover:brightness-110 active:brightness-110"
                    >
                      {/* "X active · Y inactive" instead of "X total · Y
                          active" — surfaces the exception (anyone inactive)
                          immediately instead of burying it in a total. */}
                      <span>{group.label} <span className="divider-meta ml-2 normal-case font-normal">{activeCount} active · {inactiveCount} inactive</span></span>
                      <ChevronDownIcon className={`divider-meta h-3.5 w-3.5 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
                    </button>
                    )
                  })()}
                  {(!group.label || !collapsedGroups[group.key]) && (
                  <div className="card divide-y divide-slate-line overflow-hidden">
                    {group.items.map(person => {
                      // Category alone for a doctor (every role in this app
                      // implies "doctor" except locum/clerk, so spelling it
                      // out is redundant) — matches the desktop table and
                      // every other row style in this file.
                      const secondaryLabel = person.role === 'doctor'
                        ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
                        : (ROLE_LABELS[person.role] || person.role)
                      const contractTag = contractTagText(person)
                      return (
                        <div
                          key={person.id}
                          onClick={() => handleRowClick(person)}
                          onPointerDown={e => handleRowPointerDown(e, person)}
                          onPointerUp={cancelLongPress}
                          onTouchEnd={handleRowTouchEnd}
                          onPointerLeave={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          onContextMenu={e => { if (canContact) e.preventDefault() }}
                          // No fade on an inactive account — the red
                          // "Inactive" chip below is the signal. Dimming
                          // the whole row made the name and contact
                          // details harder to read for no extra meaning.
                          className={`flex items-center gap-3 px-4 py-1 transition-colors hover:bg-canvas-sunken ${canContact ? 'cursor-pointer no-callout active:bg-slate-line' : ''}`}
                        >
                          <div className="relative flex-shrink-0">
                            <ProfileAvatar profile={person} size={40} />
                            <StatusPicker
                              active={person.is_active}
                              onLeave={leaveProfileIds.has(person.id)}
                              size={14}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {person.name ? `${person.name} ` : ''}{person.surname}
                            </span>
                            {/* line-clamp-2, not truncate: a long category
                                combo (e.g. "COSMO (Psych)") wraps to a
                                second line instead of silently cutting
                                off. */}
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                              <span className="line-clamp-2">{secondaryLabel}</span>
                              {contractTag && (
                                <span
                                  className="chip-mint flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold"
                                  title={CONTRACT_TAG_TITLE[person.contract_type]}
                                >
                                  {contractTag}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Chips, then the temp-password shield in a slot
                              of its own just left of the kebab. The shield
                              used to sit between the Admin and Inactive
                              chips in one right-aligned run, so it landed
                              beside the kebab on one row and a chip's width
                              further left on the next. The slot is reserved
                              on every row an admin sees (only admins ever
                              get the shield), which also keeps the chips
                              themselves lined up down the list. An inactive
                              admin's two chips sit side by side on one line
                              (the name truncates to make room). */}
                          <div className="flex flex-shrink-0 items-center gap-1.5">
                            <div className="flex items-center gap-1">
                              {isAdmin && person.is_admin && (
                                <span className={`flex items-center whitespace-nowrap rounded-md border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-normal ${
                                  person.is_super_admin ? 'border-flagBlue text-flagBlue' : 'border-accent text-accent'
                                }`}>
                                  {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                                </span>
                              )}
                              {!person.is_active && (
                                <span className="flex items-center whitespace-nowrap rounded-md border border-flagRed/40 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-normal text-flagRed">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {isAdmin && (
                              <span className="flex w-5 flex-shrink-0 justify-center">
                                {person.must_change_password && <TempPasswordIndicator notSignedIn={!person.is_active || neverSignedInIds.has(person.id)} person={person} />}
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

            {/* Desktop/tablet: the Requests layout — each section's bar above
                its own panel, the column names inside the panel. Fixed column
                widths so the panels' columns line up down the page. */}
            <div className="hidden md:block">
              {groups.map(group => (
                <div key={group.key} className="mb-4 last:mb-0">
                  {group.label && (() => {
                    const activeCount = group.items.filter(p => p.is_active).length
                    return (
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(group.key)}
                      aria-expanded={!collapsedGroups[group.key]}
                      className="sheen-divider mb-2 w-full transition-[filter] hover:brightness-110 active:brightness-110"
                    >
                      <span>{group.label} <span className="divider-meta ml-2 normal-case font-normal">{group.items.length} total • {activeCount} active</span></span>
                      <ChevronDownIcon className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
                    </button>
                    )
                  })()}
                  {(!group.label || !collapsedGroups[group.key]) && (
                  <div className="card overflow-x-auto" data-testid="staff-section-panel">
                    <table className="w-full min-w-[680px] table-fixed border-collapse text-xs">
                      <colgroup>
                        {/* Contact takes a share of the width (it grows and
                            shrinks with the window); a long email truncates
                            inside it rather than running into Status. */}
                        <col />
                        <col className="w-[30%]" />
                        <col className="w-52" />
                        {isAdmin && <col className="w-24" />}
                        {canContact && <col className="w-32" />}
                      </colgroup>
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
                            {group.items.map(person => {
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
                                  // No fade on an inactive account — the Status
                                  // column (toggle off + red "Inactive") is the
                                  // signal. Dimming the whole row also washed
                                  // that red label out to grey.
                                  className={`border-b border-slate-line last:border-0 transition-colors hover:bg-canvas-sunken ${
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
                                              className="chip-mint rounded px-1 py-0.5 text-[10px] font-semibold"
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
                                  <td className="overflow-hidden px-2.5 py-1.5 text-ink">
                                    <div className="min-w-0 space-y-0.5">
                                      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
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
                                      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                                        <EmailIcon className="h-3 w-3 flex-shrink-0 text-ink-muted" />
                                        {targetEmail && person.email_verified ? (
                                          <a
                                            href={`mailto:${targetEmail}`}
                                            onClick={e => e.stopPropagation()}
                                            title={targetEmail}
                                            className="min-w-0 truncate hover:underline"
                                          >
                                            {targetEmail}
                                          </a>
                                        ) : (
                                          <span className="min-w-0 truncate" title={targetEmail || undefined}>{targetEmail || '—'}</span>
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
                                            onClick={e => { e.stopPropagation(); !isToggling && requestToggleActive(person) }}
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
                                        {/* The activity period, for anyone whose
                                            account has one: "Active until" for a
                                            running placement, "Starts" for one
                                            scheduled to begin. Category-agnostic —
                                            interns, registrars and anyone else an
                                            admin has given dates. */}
                                        {!person.is_active
                                          ? (person.scheduled_active_date
                                              ? <>Starts {formatShortDateRange(person.scheduled_active_date, person.scheduled_active_date)}</>
                                              : 'Inactive')
                                          : leaveProfileIds.has(person.id) ? 'On leave' : 'Active'}
                                        {person.is_active && activeUntilFor(person) && (
                                          <> until {formatShortDateRange(activeUntilFor(person), activeUntilFor(person))}</>
                                        )}
                                      </span>
                                      {isAdmin && (person.scheduled_inactive_date || person.scheduled_active_date) && (
                                        <button
                                          type="button"
                                          onClick={e => { e.stopPropagation(); navigate(`/account/${person.id}`, { state: { backgroundLocation: location } }) }}
                                          title="Edit this account"
                                          aria-label={`Edit ${person.name} ${person.surname}`}
                                          className="text-[11px] font-medium text-accent hover:text-accent-dark hover:underline"
                                        >
                                          Edit
                                        </button>
                                      )}
                                      {/* Pinned to the cell's right edge (ml-auto)
                                          rather than trailing the status text,
                                          which varies in length row to row
                                          ("Active" vs "Active until 31 Dec Edit")
                                          and carried the shield with it. */}
                                      {isAdmin && person.must_change_password && <TempPasswordIndicator className="ml-auto pl-2" notSignedIn={!person.is_active || neverSignedInIds.has(person.id)} person={person} />}
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
                                          title="Message"
                                          onClick={e => openContactFlyout(person, 'message', e.currentTarget)}
                                        />
                                        <RowActionIcon
                                          icon={<PhoneIcon className="h-4 w-4" />}
                                          title="Call"
                                          onClick={e => openContactFlyout(person, 'call', e.currentTarget)}
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
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              ))}
            </div>
            {/* One button for both lists: with every category shut, the
                page is nothing but headers on either viewport. */}
            {allGroupsCollapsed && <ExpandAllButton onExpandAll={() => setCollapsedGroups({})} />}
            </>
          )}

          {/* ── Recently deleted accounts (admin, All Staff only) ── */}
          {isAdmin && tab === 'accounts' && deletionLog.length > 0 && (
            <section className="mt-8" aria-labelledby="deletion-log-heading">
              <button
                type="button"
                id="deletion-log-heading"
                onClick={() => setDeletionLogOpen(open => !open)}
                aria-expanded={deletionLogOpen}
                className="flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink"
              >
                <span aria-hidden="true">{deletionLogOpen ? '▾' : '▸'}</span>
                Recently deleted accounts ({deletionLog.length})
              </button>
              {deletionLogOpen && (
                <div className="card mt-3 overflow-hidden">
                  <ul className="divide-y divide-edge">
                    {deletionLog.map(entry => (
                      <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                        <div>
                          <span className="font-medium text-ink">{entry.name} {entry.surname}</span>
                          {entry.email && <span className="ml-2 text-ink-muted">{entry.email}</span>}
                          <span className="ml-2 text-xs text-ink-light">
                            {[entry.role && (entry.role[0].toUpperCase() + entry.role.slice(1)), entry.category && (CATEGORY_LABELS[entry.category] || entry.category)].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                        <div className="text-xs text-ink-light">
                          Deleted {new Date(entry.deleted_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {entry.deleter ? ` by ${entry.deleter.name} ${entry.deleter.surname}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-edge px-4 py-2 text-xs text-ink-light">
                    Deleted accounts cannot be restored. Someone who returns will need a new account.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ── Tab: pending account approvals (admin only) ── */}
      {/* No breadcrumb here — "← All staff" duplicated the already-active
          "Pending Approvals" tab above it (docs/design/layout-spec.md §4). */}
      {!loading && isAdmin && tab === 'requests' && sub === 'new-users' && (
        <div className="mx-auto md:max-w-2xl">
          {pending.length === 0 && locumContactCount === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No account requests. Sign-ups awaiting approval and rostered locums without an account appear here.</p>
            </div>
          ) : (
            /* Two sections, each a sheen header bar over its own card — the
               Staff list's own shape — and each shown only while it has
               rows: sign-ups waiting on an approval, then locums put on the
               roster by name and mobile who still need an account. */
            <div className="space-y-4">
              {pending.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setRequestSectionsCollapsed(c => ({ ...c, pending: !c.pending }))}
                    aria-expanded={!requestSectionsCollapsed.pending}
                    className="sheen-divider mb-2 w-full transition-[filter] hover:brightness-110 active:brightness-110"
                  >
                    <span>Pending approvals <span className="divider-meta ml-2 normal-case font-normal">{pending.length}</span></span>
                    <ChevronDownIcon className={`divider-meta h-3.5 w-3.5 flex-shrink-0 transition-transform ${requestSectionsCollapsed.pending ? 'rotate-180' : ''}`} />
                  </button>
                  {!requestSectionsCollapsed.pending && (
                    <div className="card overflow-hidden">
                      {filteredPending.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-ink-muted">No accounts match these filters.</p>
                      ) : (
                        <>
                          <div className="divide-y divide-slate-line">
                            {orderedPending.map((person) => (
                              <PendingApprovalRow
                                key={person.id}
                                person={person}
                                approveAccount={approveAccount}
                                rejectAccount={rejectAccount}
                                onEdit={id => navigate(`/staff/pending/${id}`, { state: { backgroundLocation: location } })}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {locumContactCount > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setRequestSectionsCollapsed(c => ({ ...c, locums: !c.locums }))}
                    aria-expanded={!requestSectionsCollapsed.locums}
                    className="sheen-divider mb-2 w-full transition-[filter] hover:brightness-110 active:brightness-110"
                  >
                    <span>Rostered locums needing accounts <span className="divider-meta ml-2 normal-case font-normal">{locumContactCount}</span></span>
                    <ChevronDownIcon className={`divider-meta h-3.5 w-3.5 flex-shrink-0 transition-transform ${requestSectionsCollapsed.locums ? 'rotate-180' : ''}`} />
                  </button>
                  {!requestSectionsCollapsed.locums && (
                    <div className="card overflow-hidden">
                      <LocumContactsPanel onLinked={() => loadAll({ silent: true })} onCount={setLocumContactCount} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: pending account change requests (admin only) ── */}
      {!loading && isAdmin && tab === 'requests' && sub === 'user-requests' && (
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
              <div className="card overflow-hidden">
                <div className="divide-y divide-slate-line">
                  {displayedRequests.map((r) => {
                    const isActioning = requestActioningId === r.id
                    const secondaryLabel = r.requester?.role === 'doctor'
                      ? (r.requester?.category ? (CATEGORY_LABELS[r.requester.category] || r.requester.category) : null)
                      : (ROLE_LABELS[r.requester?.role] || r.requester?.role)
                    const fullName = `${r.requester?.name ? `${r.requester.name} ` : ''}${r.requester?.surname || 'Unknown'}`
                    const typeLabel = REQUEST_TYPE_LABELS[r.request_type] || r.request_type
                    const requested = `Requested ${r.created_at?.slice(0, 10).split('-').reverse().join('-')}`
                    return (
                      <RequestRow
                        key={r.id}
                        person={{ id: r.profile_id, ...r.requester }}
                        name={fullName}
                        meta={secondaryLabel}
                        onClick={() => navigate(`/account/${r.profile_id}`, { state: { backgroundLocation: location } })}
                        actions={[
                          {
                            title: 'What is requested',
                            element: (
                              <InfoPopover icon={<MessageCircleQuestionMark className="h-4 w-4" />} title="What is requested" label={`What ${fullName} is requesting`} tone="primary-text">
                                <p className="text-sm font-semibold text-ink">{typeLabel}</p>
                                {r.request_type !== 'deletion' && (
                                  <p className="mt-0.5 text-ink">{formatRequestValue(r.current_value, r.request_type) || '—'} → <span className="font-medium">{formatRequestValue(r.requested_value, r.request_type)}</span></p>
                                )}
                                {r.reason && <p className="mt-1 italic">&quot;{r.reason}&quot;</p>}
                                <p className="mt-1 text-ink-muted">{requested}</p>
                                {r.request_type === 'deletion' && (
                                  <p className="mt-1 text-flagAmber">Approving deactivates the account. The auth user itself must still be removed manually in Supabase.</p>
                                )}
                                <button type="button" onClick={() => setExpandedRequestId(r.id)} className="mt-2 font-medium text-accent underline">Open full review</button>
                              </InfoPopover>
                            ),
                          },
                          { icon: <Check className="h-4 w-4" />, title: 'Approve', label: `Approve ${fullName}'s request`, tone: 'success', onClick: () => approveRequest(r), disabled: isActioning },
                          { icon: <X className="h-4 w-4" />, title: 'Reject', label: `Reject ${fullName}'s request`, tone: 'danger', onClick: () => rejectRequest(r), disabled: isActioning },
                        ]}
                      />
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: All Requests — everything decided, either way ── */}
      {!loading && isAdmin && tab === 'requests' && sub === 'all-requests' && (() => {
        const shown = filterRequestHistory(history, historyFilters, historySearch)
        const ordered = historySort === 'desc' ? shown : [...shown].reverse()
        const reviewerName = id => { const p = historyNames.get(id); return p ? `${p.name} ${p.surname}` : null }
        const when = iso => (iso ? `${iso.slice(0, 10).split('-').reverse().join('-')}` : 'date unknown')
        const chip = {
          approved: 'bg-success-bg text-success',
          declined: 'bg-flagRed-bg text-flagRed',
          linked: 'bg-accent-light text-accent-dark',
        }
        const chipLabel = { approved: 'Approved', declined: 'Declined', linked: 'Linked' }
        return (
          <div className="mx-auto md:max-w-2xl">
            {historyLoading ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : history.length === 0 ? (
              <div className="card p-10 text-center"><p className="text-sm text-ink-muted">No decided requests yet.</p></div>
            ) : ordered.length === 0 ? (
              <div className="card p-10 text-center"><p className="text-sm text-ink-muted">No requests match these filters.</p></div>
            ) : (
              <div className="card overflow-hidden">
                <div className="divide-y divide-slate-line">
                  {ordered.map(item => (
                    <RequestRow
                      key={item.id}
                      person={item.person}
                      name={item.name}
                      meta={[item.category ? (CATEGORY_LABELS[item.category] || item.category) : (ROLE_LABELS[item.role] || item.role), item.typeLabel].filter(Boolean).join(' · ')}
                      detail={item.detail}
                      column={[reviewerName(item.reviewedBy) && `by ${reviewerName(item.reviewedBy)}`, when(item.at)].filter(Boolean).join(' · ')}
                      onClick={item.profileId && item.status !== 'declined' ? () => navigate(`/account/${item.profileId}`, { state: { backgroundLocation: location } }) : undefined}
                      trailing={(
                        <span className="flex flex-col items-end gap-0.5 pr-1">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip[item.status]}`}>{chipLabel[item.status]}</span>
                          <span className="text-[11px] text-ink-muted md:hidden">{when(item.at)}</span>
                        </span>
                      )}
                    >
                      {item.note && <p className="text-xs italic text-ink-muted">&quot;{item.note}&quot;</p>}
                    </RequestRow>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Per-row quick-action popover — shared by both the mobile and
           desktop kebab triggers, visible to any canContact viewer (admin,
           clerk, locum, or MO/Registrar doctor). iOS Contacts-style:
           anchored to wherever the kebab was pressed (rolling down from a
           row in the top/middle of the screen, up from one near the
           bottom). Message/Call open a second, separate flyout popover
           cascading below that row (see below) rather than expanding in
           place. Mail goes straight to the mail client. Update status
           reuses the same requestToggleActive/StatusChangeConfirmModal
           flow as the desktop table's own status toggle — this is the
           only quick way to flip a doctor's active status from the
           mobile card list, since its StatusPicker badge renders
           read-only there. ── */}
      {quickActionPerson && quickActionAnchor && (() => {
        const targetEmail = emailById[quickActionPerson.id]
        const mailHref = targetEmail ? `mailto:${targetEmail}` : null

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
            className="fixed z-50 overflow-hidden rounded-xl border border-edge bg-canvas-raised py-1 shadow-raised"
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
            {isAdmin && quickActionPerson.role === 'doctor' && quickActionPerson.is_approved !== false && (
              <QuickActionRow
                label={`${quickActionPerson.name || quickActionPerson.surname || 'Their'}’s year`}
                onClick={() => { const id = quickActionPerson.id; closeQuickActions(); navigate(`/my-year/${id}`) }}
              />
            )}
            {isAdmin && (
              <QuickActionRow
                label="Update status"
                onClick={() => { requestToggleActive(quickActionPerson); closeQuickActions() }}
              />
            )}
            {/* For anyone who lost the welcome email their account was
                created with, or never got it — issues a fresh password
                and emails it. Admin-only, and confirmed in the modal
                before anything is invalidated. */}
            {isAdmin && (
              <QuickActionRow
                label="Regenerate password"
                onClick={() => { setRegeneratePasswordFor(quickActionPerson); closeQuickActions() }}
              />
            )}
          </div>
        )
      })()}

      {/* ── Message/Call flyout — a separate popover cascading below
           whichever row (or desktop row icon) was tapped, always rolling
           down: Mobile and WhatsApp. ── */}
      {quickActionPerson && secondaryFor && secondaryAnchor && (
        <ContactFlyout
          section={secondaryFor}
          anchor={secondaryAnchor}
          phone={quickActionPerson.phone}
          menuRef={secondaryMenuRef}
          onPicked={closeQuickActions}
          onMissing={() => { contactMissing(quickActionPerson.name || quickActionPerson.surname || 'this person'); closeQuickActions() }}
        />
      )}

      {/* ── Mobile row-tap detail sheet — profile summary, contact fields,
           and one-tap Message/Call/Email/View Account actions. Closes on
           the first outside tap (muting whatever's under it) or picking an
           action.

           It used to open with no backdrop, on the reasoning that no other
           popover in the app had one. That stopped being true — Modal,
           ActionSheet and SlideOverPanel all dim the page behind them — and
           it was the whole reason this sheet had nothing separating it from
           the staff list: both are `canvas-raised`, its border was the same
           `slate-line` as the cards behind it, and its shadow was a
           hardcoded light-theme black that a dark page swallows whole. The
           scrim does most of the work; `edge` and a themed shadow do the
           rest. ── */}
      {detailSheetPerson && (() => {
        const person = detailSheetPerson
        const secondaryLabel = person.role === 'doctor'
          ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
          : (ROLE_LABELS[person.role] || person.role)
        const formattedPhone = formatPhoneDisplay(person.phone)
        const targetEmail = emailById[person.id]
        const onLeave = leaveProfileIds.has(person.id)
        const statusLabel = !person.is_active
          ? (person.scheduled_active_date ? `Starts ${formatShortDateRange(person.scheduled_active_date, person.scheduled_active_date)}` : 'Inactive')
          : onLeave ? 'On leave'
          : activeUntilFor(person) ? `Active until ${formatShortDateRange(activeUntilFor(person), activeUntilFor(person))}`
          : 'Active'
        const statusColor = !person.is_active ? 'text-flagRed' : onLeave ? 'text-statusAway' : 'text-success'
        const firstNameForMissing = person.name || person.surname || 'this person'

        return (
          <>
          <div className="fixed inset-0 z-40 scrim md:hidden" aria-hidden="true" />
          <div
            ref={detailSheetRef}
            role="dialog"
            aria-modal="true"
            style={detailSheetSwipe.style}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-edge bg-canvas-raised px-5 pb-6 pt-3 shadow-raised md:hidden"
          >
            <div {...detailSheetSwipe.handleProps} className="touch-none">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-line" />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{person.name ? `${person.name} ` : ''}{person.surname}</p>
                  <p className="line-clamp-2 text-sm text-ink-muted">{secondaryLabel}</p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
                  {person.is_active && onLeave && leaveDatesById[person.id] && (
                    <span className="whitespace-nowrap text-xs font-medium" style={{ color: leaveTypeInk(leaveDatesById[person.id][2]) }}>{formatShortDateRange(leaveDatesById[person.id][0], leaveDatesById[person.id][1])}</span>
                  )}
                  {isAdmin && person.must_change_password && (
                    <span className={`flex items-center gap-1 text-right text-xs font-medium ${person.is_active && !neverSignedInIds.has(person.id) && !isTempPasswordExpired(person) ? 'whitespace-nowrap text-ink-muted' : 'text-rose'}`}>
                      <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                      {isTempPasswordExpired(person)
                        ? `Temp password expired ${formatExpiryDate(tempPasswordExpiresAt(person.temp_password_issued_at))}`
                        : person.is_active && !neverSignedInIds.has(person.id) ? 'Temp password in use' : 'Account created; not signed in'}
                    </span>
                  )}
                </div>
              </div>
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
          </>
        )
      })()}

      {/* ── Missing-contact toast ────────────────────── */}
      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(70px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-4">
          <div className="rounded-lg bg-ink px-4 py-2.5 text-sm text-canvas shadow-raised">{toast}</div>
        </div>
      )}

      {expandedRequestId && (() => {
        const r = accountRequests.find(req => req.id === expandedRequestId)
        if (!r) return null
        const secondaryLabel = r.requester?.role === 'doctor'
          ? (r.requester?.category ? (CATEGORY_LABELS[r.requester.category] || r.requester.category) : null)
          : (ROLE_LABELS[r.requester?.role] || r.requester?.role)
        const requesterName = `${r.requester?.name ? `${r.requester.name} ` : ''}${r.requester?.surname || 'Unknown'}`
        const changeLine = r.request_type !== 'deletion'
          ? `${formatRequestValue(r.current_value, r.request_type) || '—'} → ${formatRequestValue(r.requested_value, r.request_type)}`
          : null
        const submittedDate = r.created_at?.slice(0, 10).split('-').reverse().join('-')
        const submittedTime = r.created_at?.slice(11, 16)
        return (
          <AccountRequestReviewDrawer
            requesterName={requesterName}
            secondaryLabel={secondaryLabel}
            requestTypeLabel={REQUEST_TYPE_LABELS[r.request_type] || r.request_type}
            changeLine={changeLine}
            reason={r.reason}
            deletionWarning={r.request_type === 'deletion' ? 'Approving deactivates the account. To remove it entirely, open the account and use Delete account in its Danger Zone.' : null}
            submittedDate={submittedDate}
            submittedTime={submittedTime}
            onClose={() => setExpandedRequestId(null)}
            onApprove={async () => { await approveRequest(r); setExpandedRequestId(null) }}
            onReject={async notes => { await rejectRequest(r, notes); setExpandedRequestId(null) }}
            isActioning={requestActioningId === r.id}
          />
        )
      })()}

      {addStaffOpen && (
        <AddStaffModal
          onClose={() => setAddStaffOpen(false)}
          onCreated={loadAll}
        />
      )}

      {regeneratePasswordFor && (
        <RegeneratePasswordModal
          person={regeneratePasswordFor}
          email={emailById[regeneratePasswordFor.id]}
          onClose={() => setRegeneratePasswordFor(null)}
        />
      )}

      {statusConfirm && (
        <StatusChangeConfirmModal
          firstName={statusConfirm.firstName}
          nextActive={!statusConfirm.currentlyActive}
          saving={statusConfirmSaving}
          onConfirm={confirmStatusChange}
          onClose={() => !statusConfirmSaving && setStatusConfirm(null)}
        />
      )}
    </div>
  )
}


function KebabIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
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
