import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar, { StatusBadge } from '../components/ProfileAvatar'
import { formatPhoneDisplay, phoneTelHref } from '../lib/phone'
import { STAFF_QUICK_ACTIONS } from '../lib/staffQuickActions'

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
  super_admin: 'bg-accent text-white',
}

// Only five_eighths gets a tag — full and psych_overtime show nothing extra.
const CONTRACT_TAG_LABEL = { five_eighths: '⅝' }

const SORT_MODE_KEY = 'rotacat:staffSortMode'
const SORT_MODES = [
  { key: 'category', label: 'Category' },
  { key: 'role', label: 'Role' },
  { key: 'az', label: 'A–Z' },
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

function buildGroups(people, sortMode) {
  if (sortMode === 'az') {
    return [{
      key: 'all',
      label: null,
      items: [...people].sort((a, b) => (a.surname || '').localeCompare(b.surname || '')),
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

// ── Shared bottom-sheet / dialog wrapper ────────────────────
function Sheet({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-canvas-raised p-5 shadow-raised md:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-muted hover:bg-canvas-sunken hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function StaffListPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
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
  const [accountFilters, setAccountFilters] = useState({ q: '', role: 'all', category: 'all', status: 'all', isAdmin: 'all' })
  const [accountRequests, setAccountRequests] = useState([])
  const [requestActioningId, setRequestActioningId] = useState(null)

  // Filters sheet
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState(accountFilters)

  // Sort / group — persisted locally so it doesn't reset every visit
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem(SORT_MODE_KEY) || 'category' } catch { return 'category' }
  })
  useEffect(() => {
    try { localStorage.setItem(SORT_MODE_KEY, sortMode) } catch { /* ignore */ }
  }, [sortMode])

  // Per-row quick-action sheet (mobile, admin viewers)
  const [quickActionPerson, setQuickActionPerson] = useState(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  useEffect(() => {
    loadAll()
  }, [isAdmin])

  async function loadAll() {
    setLoading(true)
    setError('')

    const [accountsRes, pendingRes, emailsRes, requestsRes] = await Promise.all([
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
    ])

    if (accountsRes.error) {
      setError(accountsRes.error.message)
    }
    setActiveAccounts(accountsRes.data || [])
    setPending(pendingRes.data || [])
    setAccountRequests(requestsRes.data || [])

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
    const isAdminFlag = role === 'clerk' ? false : (ed.isAdmin ?? profile.is_admin ?? false)

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

  // ── Quick-action sheet handlers ─────────────────────────────
  function openQuickActions(person) {
    setQuickActionPerson(person)
    setConfirmDeactivate(false)
  }
  function closeQuickActions() {
    setQuickActionPerson(null)
    setConfirmDeactivate(false)
  }
  function handleQuickAction(key) {
    if (!quickActionPerson) return
    if (key === 'setStatus') {
      if (quickActionPerson.is_active) {
        setConfirmDeactivate(true)
        return
      }
      toggleActive(quickActionPerson.id, false)
      closeQuickActions()
    } else if (key === 'setAdmin') {
      if (quickActionPerson.is_super_admin) return
      toggleAdmin(quickActionPerson)
      closeQuickActions()
    } else if (key === 'editProfile') {
      navigate(`/account/${quickActionPerson.id}`)
      closeQuickActions()
    }
  }
  function confirmDeactivateNow() {
    if (!quickActionPerson) return
    toggleActive(quickActionPerson.id, true)
    closeQuickActions()
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

  const groups = buildGroups(filteredAccounts, sortMode)

  function openFiltersSheet() {
    setDraftFilters(accountFilters)
    setFiltersOpen(true)
  }
  function applyFilters() {
    setAccountFilters(draftFilters)
    setFiltersOpen(false)
  }
  function clearSheetFilters() {
    setDraftFilters(f => ({ ...f, role: 'all', category: 'all', status: 'all', isAdmin: 'all' }))
  }
  function clearAllFilters() {
    setAccountFilters({ q: '', role: 'all', category: 'all', status: 'all', isAdmin: 'all' })
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Staff</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {activeAccounts.length} staff members on record
            {isAdmin && pending.length > 0 && ` · ${pending.length} pending approval`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-lg border border-accent/25 bg-canvas-raised p-1 w-fit">
        <button
          onClick={() => setTab('accounts')}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'accounts' ? 'bg-accent text-white' : 'text-ink-light hover:text-ink'
          }`}
        >
          All Staff ({activeAccounts.length})
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('pending')}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'pending'
                ? 'bg-accent text-white'
                : pending.length > 0
                  ? 'text-flagAmber hover:text-ink'
                  : 'text-ink-muted opacity-50 hover:text-ink hover:opacity-100'
            }`}
          >
            Pending ({pending.length})
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setTab('requests')}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'requests'
                ? 'bg-accent text-white'
                : accountRequests.length > 0
                  ? 'text-flagAmber hover:text-ink'
                  : 'text-ink-muted opacity-50 hover:text-ink hover:opacity-100'
            }`}
          >
            Account requests ({accountRequests.length})
          </button>
        )}
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
          <p className="mb-3 text-xs text-ink-muted">
            {isAdmin
              ? 'Inactive doctors remain on record but are excluded from roster generation. Toggle the switch to activate or deactivate an account.'
              : 'Inactive doctors remain on record but are excluded from roster generation.'}
          </p>

          {/* Search + Filters + Sort/group */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:max-w-xs sm:flex-1">
                <label className="label-text">Search name</label>
                <input
                  type="text"
                  value={accountFilters.q}
                  onChange={e => setAccountFilters(f => ({ ...f, q: e.target.value }))}
                  placeholder="Surname or first name…"
                  className="input-field"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={openFiltersSheet} className="btn-secondary whitespace-nowrap">
                  Filters{sheetFilterCount > 0 ? ` · ${sheetFilterCount}` : ''}
                </button>
                {accountFiltersActive && (
                  <button onClick={clearAllFilters} className="btn-secondary whitespace-nowrap">
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            <div className="inline-flex w-fit gap-1 rounded-lg border border-accent/25 bg-canvas-raised p-1">
              {SORT_MODES.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortMode(opt.key)}
                  className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === opt.key ? 'bg-accent text-white' : 'text-ink-light hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {activeAccounts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No approved accounts yet.</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No accounts match these filters.</p>
            </div>
          ) : (
            <>
            {/* Mobile: stacked rows, grouped by sortMode. Desktop/tablet: full table (below). */}
            <div className="md:hidden">
              {groups.map(group => (
                <div key={group.key} className="mb-4 last:mb-0">
                  {group.label && (
                    <div className="sticky top-14 z-[5] mb-2 rounded bg-canvas-sunken px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {group.label} ({group.items.length})
                    </div>
                  )}
                  <div className="card divide-y divide-slate-line overflow-hidden">
                    {group.items.map(person => {
                      const secondaryLabel = person.role === 'doctor'
                        ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
                        : (ROLE_LABELS[person.role] || person.role)
                      const formattedPhone = formatPhoneDisplay(person.phone)
                      const contractTag = CONTRACT_TAG_LABEL[person.contract_type]
                      return (
                        <div
                          key={person.id}
                          onClick={() => isAdmin && navigate(`/account/${person.id}`)}
                          className={`flex items-center gap-3 px-4 py-3 ${!person.is_active ? 'opacity-50' : ''} ${
                            isAdmin ? 'cursor-pointer active:bg-canvas-sunken' : ''
                          }`}
                        >
                          <ProfileAvatar profile={person} size={40} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-ink">
                                {person.name ? `${person.name} ` : ''}{person.surname}
                              </span>
                              <StatusBadge active={person.is_active} />
                              {person.is_admin && (
                                <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium text-white ${
                                  person.is_super_admin ? 'bg-flagBlue' : 'bg-accent'
                                }`}>
                                  {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                              <span>{secondaryLabel}</span>
                              {contractTag && (
                                <span
                                  className="rounded bg-canvas-sunken px-1 py-0.5 text-[10px] font-semibold text-ink-muted"
                                  title="Part-time (⅝ contract)"
                                >
                                  {contractTag}
                                </span>
                              )}
                              <span className="text-slate-line" aria-hidden="true">·</span>
                              {formattedPhone ? (
                                <a
                                  href={phoneTelHref(person.phone)}
                                  onClick={e => e.stopPropagation()}
                                  className="text-accent-dark hover:underline"
                                >
                                  {formattedPhone}
                                </a>
                              ) : (
                                <span>—</span>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={e => { e.stopPropagation(); openQuickActions(person) }}
                              aria-label="Quick actions"
                              title="Quick actions"
                              className="flex-shrink-0 rounded p-1.5 text-ink-muted hover:bg-canvas-sunken hover:text-ink"
                            >
                              <KebabIcon className="h-4 w-4" />
                            </button>
                          )}
                          {isAdmin && <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-ink-muted" />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-line bg-canvas-sunken text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    <th className="px-2 py-2 w-10"><span className="sr-only">Photo</span></th>
                    <th className="px-2.5 py-2">Surname</th>
                    <th className="px-2.5 py-2">First name</th>
                    <th className="px-2.5 py-2">Role</th>
                    <th className="px-2.5 py-2">Category</th>
                    <th className="px-2.5 py-2">Mobile</th>
                    <th className="px-2.5 py-2">Email</th>
                    <th className="px-2.5 py-2">Status</th>
                    <th className="px-2.5 py-2">Is Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => (
                    <Fragment key={group.key}>
                      {group.label && (
                        <tr className="bg-canvas-sunken">
                          <td colSpan={9} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                            {group.label} ({group.items.length})
                          </td>
                        </tr>
                      )}
                      {group.items.map(person => {
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
                                  <span className={PERMISSION_BADGE.admin + ' whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium'}>
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
                                  className="text-accent-dark hover:underline"
                                >
                                  {formattedPhone}
                                </a>
                              ) : '—'}
                            </td>
                            <td className="px-2.5 py-1.5 text-ink-light">{emailById[person.id] || '—'}</td>
                            <td className="px-2.5 py-1.5">
                              <div className="flex items-center gap-1.5">
                                {isAdmin ? (
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
                                ) : (
                                  <span
                                    className={`h-2 w-2 flex-shrink-0 rounded-full ${person.is_active ? 'bg-success' : 'bg-flagAmber'}`}
                                    aria-hidden="true"
                                  />
                                )}
                                <span className={`whitespace-nowrap text-[11px] font-medium ${person.is_active ? 'text-success' : 'text-flagAmber'}`}>
                                  {person.is_active ? 'Active' : 'Inactive'}
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
        <div>
          {pending.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No accounts pending approval.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-line">
              {pending.map((person) => {
                const isEditing = editingId === person.id
                const ed = editData[person.id] || {}
                const currentRole     = ed.role     ?? person.role     ?? 'doctor'
                const currentCategory = ed.category ?? person.category ?? ''
                const currentIsAdmin = ed.isAdmin ?? person.is_admin ?? false

                return (
                  <div key={person.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-ink text-sm">
                            {person.name ? `${person.name} ` : ''}{person.surname}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[person.role] || 'bg-canvas-sunken text-ink-muted'}`}>
                            {ROLE_LABELS[person.role] || person.role}
                          </span>
                          {person.category && (
                            <span className="text-xs text-ink-muted">
                              {CATEGORY_LABELS[person.category] || person.category}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Registered {person.created_at?.slice(0, 10)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setEditingId(isEditing ? null : person.id)}
                          className="rounded border border-accent/50 px-2.5 py-1.5 text-xs font-medium text-ink-light hover:bg-accent-light"
                        >
                          {isEditing ? 'Cancel' : 'Edit role'}
                        </button>
                        <button
                          onClick={() => approveAccount(person)}
                          className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white hover:opacity-80"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectAccount(person.id)}
                          className="rounded border border-flagRed px-3 py-1.5 text-xs font-medium text-flagRed hover:bg-flagRed-bg"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    {/* Edit panel */}
                    {isEditing && (
                      <div className="mt-4 rounded-lg border border-accent/25 bg-canvas-sunken p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-ink-muted">Role</label>
                            <select
                              value={currentRole}
                              onChange={e => setEditData(prev => ({
                                ...prev,
                                [person.id]: { ...prev[person.id], role: e.target.value }
                              }))}
                              className="w-full rounded-lg border border-accent/50 bg-canvas-raised px-3 py-2 text-sm text-ink"
                            >
                              <option value="doctor">Doctor</option>
                              <option value="locum">Locum</option>
                              <option value="clerk">Clerk</option>
                            </select>
                          </div>
                          {currentRole !== 'clerk' && (
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-ink-muted">Category</label>
                              <select
                                value={currentCategory}
                                onChange={e => setEditData(prev => ({
                                  ...prev,
                                  [person.id]: { ...prev[person.id], category: e.target.value || null }
                                }))}
                                className="w-full rounded-lg border border-accent/50 bg-canvas-raised px-3 py-2 text-sm text-ink"
                              >
                                <option value="">{currentRole === 'locum' ? 'None' : 'Select…'}</option>
                                {categoryOptionsForRole(currentRole).map(({ value, label }) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {currentRole !== 'clerk' && (
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
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: pending account change requests (admin only) ── */}
      {!loading && isAdmin && tab === 'requests' && (
        <div>
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
                          className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white hover:opacity-80 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={isActioning}
                          onClick={() => rejectRequest(r)}
                          className="rounded border border-flagRed px-3 py-1.5 text-xs font-medium text-flagRed hover:bg-flagRed-bg disabled:opacity-50"
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

      {/* ── Filters sheet ─────────────────────────────────────── */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-4">
          <div>
            <label className="label-text">Role</label>
            <select
              value={draftFilters.role}
              onChange={e => setDraftFilters(f => ({ ...f, role: e.target.value }))}
              className="input-field"
            >
              <option value="all">All</option>
              {accountRoleOptions.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Category</label>
            <select
              value={draftFilters.category}
              onChange={e => setDraftFilters(f => ({ ...f, category: e.target.value }))}
              className="input-field"
            >
              <option value="all">All</option>
              {accountCategoryOptions.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Status</label>
            <select
              value={draftFilters.status}
              onChange={e => setDraftFilters(f => ({ ...f, status: e.target.value }))}
              className="input-field"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="label-text">Is Admin</label>
            <select
              value={draftFilters.isAdmin}
              onChange={e => setDraftFilters(f => ({ ...f, isAdmin: e.target.value }))}
              className="input-field"
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={clearSheetFilters} className="btn-secondary flex-1">Clear all</button>
          <button onClick={applyFilters} className="btn-primary flex-1">Apply</button>
        </div>
      </Sheet>

      {/* ── Per-row quick-action sheet (mobile, admin viewers) ── */}
      <Sheet
        open={!!quickActionPerson}
        onClose={closeQuickActions}
        title={quickActionPerson ? `${quickActionPerson.name ? quickActionPerson.name + ' ' : ''}${quickActionPerson.surname}` : ''}
      >
        {quickActionPerson && (
          confirmDeactivate ? (
            <div>
              <p className="mb-4 text-sm text-ink">
                Inactive doctors remain on record but are excluded from roster generation. Deactivate this account?
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDeactivate(false)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={confirmDeactivateNow}
                  className="flex-1 rounded bg-flagAmber px-3 py-2.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Deactivate
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {STAFF_QUICK_ACTIONS.filter(a => !a.requiresSuperAdmin || isSuperAdmin).map(action => {
                const disabled = action.key === 'setAdmin' && quickActionPerson.is_super_admin
                return (
                  <button
                    key={action.key}
                    onClick={() => !disabled && handleQuickAction(action.key)}
                    disabled={disabled}
                    title={disabled ? 'Super-admin — manage from their own Account page' : undefined}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-medium text-ink hover:bg-canvas-sunken disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {action.key === 'setStatus'
                      ? (quickActionPerson.is_active ? 'Set status · Deactivate' : 'Set status · Activate')
                      : action.key === 'setAdmin'
                        ? (quickActionPerson.is_admin ? 'Set admin · Revoke' : 'Set admin · Grant')
                        : action.label}
                  </button>
                )
              })}
            </div>
          )
        )}
      </Sheet>
    </div>
  )
}

function ChevronRightIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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

function CloseIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
