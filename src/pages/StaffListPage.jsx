import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

const CONTRACT_LABELS = {
  full:          'Full-time',
  five_eighths:  '⅝ contract',
  psych_overtime:'Psych overtime',
}

const ROLE_LABELS = {
  admin:  'Admin',
  doctor: 'Doctor',
  locum:  'Locum',
  clerk:  'Clerk',
}

const ROLE_BADGE = {
  admin:  'bg-accent text-white',
  doctor: 'bg-success-bg text-success',
  locum:  'bg-canvas-sunken text-ink-muted',
  clerk:  'bg-flagAmber-bg text-flagAmber',
}

// Category options for the approval edit panel
const CATEGORY_OPTIONS = [
  { value: 'MO',         label: 'Medical Officer' },
  { value: 'Registrar',  label: 'Registrar' },
  { value: 'COSMO',      label: 'COSMO' },
  { value: 'COSMOPsych', label: 'COSMO (Psych)' },
  { value: 'Intern',     label: 'Intern' },
  { value: 'Consultant', label: 'Consultant' },
  { value: 'Locum',      label: 'Locum' },
]

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

export default function StaffListPage() {
  const [tab, setTab] = useState('reference') // 'reference' | 'accounts' | 'pending'
  const [staff, setStaff] = useState([])
  const [activeAccounts, setActiveAccounts] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setError('')

    const [refRes, accountsRes, pendingRes] = await Promise.all([
      supabase
        .from('staff_reference')
        .select('*')
        .order('category', { ascending: true })
        .order('surname', { ascending: true }),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_approved', true)
        .order('category')
        .order('surname'),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_approved', false)
        .order('created_at', { ascending: true }),
    ])

    if (refRes.error) {
      setError(refRes.error.message)
    } else {
      setStaff(refRes.data)
    }
    setActiveAccounts(accountsRes.data || [])
    setPending(pendingRes.data || [])
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

  async function approveAccount(profile) {
    const ed = editData[profile.id] || {}
    const role     = ed.role     ?? profile.role     ?? 'doctor'
    const category = ed.category ?? profile.category ?? null

    const hours    = DEFAULT_HOURS[category]    || { min: 210, max: 246 }
    const swapGroup = DEFAULT_SWAP_GROUP[category] || 'junior'

    await supabase.from('profiles').update({
      is_approved:  true,
      is_active:    true,
      role,
      category:     category || null,
      min_hours:    hours.min,
      max_hours:    hours.max,
      swap_group:   swapGroup,
    }).eq('id', profile.id)

    setEditingId(null)
    loadAll()
  }

  async function rejectAccount(profileId) {
    await supabase.from('profiles').update({ is_approved: false, is_active: false })
      .eq('id', profileId)
    loadAll()
  }

  // ── Group staff_reference by category for display ──────────
  const grouped = staff.reduce((acc, person) => {
    const key = person.category
    if (!acc[key]) acc[key] = []
    acc[key].push(person)
    return acc
  }, {})

  const categoryOrder = ['MO', 'Registrar', 'COSMO', 'COSMOPsych', 'Intern', 'Consultant', 'Locum',
                          'EC_COSMO', 'EC_COSMO_Intern', 'OT_COSMO', 'OT_COSMO_Intern']

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Staff</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {staff.length} staff members on record
            {pending.length > 0 && ` · ${pending.length} pending approval`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-lg border border-accent/25 bg-canvas-raised p-1 w-fit">
        <button
          onClick={() => setTab('reference')}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'reference' ? 'bg-accent text-white' : 'text-ink-light hover:text-ink'
          }`}
        >
          Staff list
        </button>
        <button
          onClick={() => setTab('accounts')}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'accounts' ? 'bg-accent text-white' : 'text-ink-light hover:text-ink'
          }`}
        >
          Accounts ({activeAccounts.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'pending'
              ? 'bg-accent text-white'
              : pending.length > 0
                ? 'text-flagAmber hover:text-ink'
                : 'text-ink-light hover:text-ink'
          }`}
        >
          Pending ({pending.length})
        </button>
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
            Inactive doctors remain on record but are excluded from roster generation.
            Toggle the switch to activate or deactivate an account.
          </p>
          {activeAccounts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No approved accounts yet.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-line">
              {activeAccounts.map(person => {
                const isToggling = togglingId === person.id
                return (
                  <div key={person.id} className={`flex items-center justify-between px-5 py-3 ${!person.is_active ? 'opacity-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-ink">
                          {person.surname}{person.name ? `, ${person.name}` : ''}
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
                      {!person.is_active && (
                        <p className="mt-0.5 text-xs text-flagAmber">Inactive — excluded from roster generation</p>
                      )}
                    </div>
                    {/* Active / Inactive toggle */}
                    <button
                      onClick={() => !isToggling && toggleActive(person.id, person.is_active)}
                      disabled={isToggling}
                      title={person.is_active ? 'Click to deactivate' : 'Click to activate'}
                      className={`relative ml-4 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                        person.is_active ? 'bg-accent' : 'bg-slate-line'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          person.is_active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: staff_reference (original grouped view) ── */}
      {!loading && !error && tab === 'reference' && (
        <div className="space-y-6">
          {categoryOrder
            .filter((cat) => grouped[cat]?.length)
            .map((cat) => (
              <div key={cat}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {CATEGORY_LABELS[cat] || cat} ({grouped[cat].length})
                </h2>
                <div className="card divide-y divide-slate-line overflow-hidden">
                  {grouped[cat].map((person) => (
                    <div key={person.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: person.color_code }}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {person.name ? `${person.name} ` : ''}{person.surname}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {CONTRACT_LABELS[person.contract_type]} ·{' '}
                            {person.min_hours}–{person.max_hours}h/month
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {person.weekend_day_saturday_only && (
                          <span className="rounded bg-flagAmber-bg px-2 py-0.5 text-[11px] font-medium text-flagAmber">
                            Sat only
                          </span>
                        )}
                        {person.no_weekend_nights && (
                          <span className="rounded bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                            No WE nights
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Tab: pending account approvals ── */}
      {!loading && tab === 'pending' && (
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

                return (
                  <div key={person.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-ink text-sm">
                            {person.surname}{person.name ? `, ${person.name}` : ''}
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
                              <option value="admin">Admin</option>
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
                                <option value="">None</option>
                                {CATEGORY_OPTIONS.map(({ value, label }) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </div>
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
    </div>
  )
}
