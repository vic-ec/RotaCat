import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── Display label maps (kept local + consistent with StaffListPage/AppLayout) ──
const CATEGORY_LABELS = {
  MO:              'Medical Officer',
  Registrar:       'Registrar',
  COSMO:           'COSMO',
  COSMOPsych:      'COSMO (Psych)',
  Intern:          'Intern',
  Consultant:      'Consultant',
  Locum:           'Locum',
  EC_COSMO:        'EC COSMO',
  EC_COSMO_Intern: 'EC Intern',
  OT_COSMO:        'OT COSMO',
  OT_COSMO_Intern: 'OT Intern',
}
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))

const ROLE_LABELS = {
  admin:      'Admin',
  doctor:     'Doctor',
  consultant: 'Consultant',
  locum:      'Locum',
  clerk:      'Clerk',
}
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

const NOTIFICATION_LABELS = {
  roster_published:    'Roster published',
  leave_approved:      'Leave request approved',
  leave_rejected:      'Leave request rejected',
  swap_request:        'New swap request',
  swap_accepted:       'Swap accepted by colleague',
  swap_rejected:       'Swap rejected by colleague',
  swap_admin_approved: 'Swap approved by admin',
  shift_claimed:       'Advertised shift claimed',
  account_approved:    'Account approved',
  account_rejected:    'Account rejected',
  ph_lieu_updated:     'Public holiday lieu day updated',
  reminder:            'Reminders',
  general:             'General notifications',
}
// Fixed display order — falls back to object key order for anything unlisted
const NOTIFICATION_ORDER = [
  'roster_published', 'leave_approved', 'leave_rejected',
  'swap_request', 'swap_accepted', 'swap_rejected', 'swap_admin_approved',
  'shift_claimed', 'account_approved', 'account_rejected',
  'ph_lieu_updated', 'reminder', 'general',
]

const REQUEST_STATUS_BADGE = {
  pending:  'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
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

export default function AccountSettingsPage() {
  const { user, profile, isAdmin, refreshProfile } = useAuth()
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({ name: '', surname: '', phone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null) // { type: 'success'|'error', text }

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const [prefs, setPrefs] = useState({})
  const [prefsSaving, setPrefsSaving] = useState(false)

  const [pwForm, setPwForm] = useState({ password: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  // Admin-only direct role/category edit
  const [adminRole, setAdminRole] = useState('')
  const [adminCategory, setAdminCategory] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)

  // Non-admin change requests
  const [myRequests, setMyRequests] = useState([])
  const [requestForm, setRequestForm] = useState({ type: 'role', value: '', reason: '' })
  const [requestSaving, setRequestSaving] = useState(false)
  const [requestMsg, setRequestMsg] = useState(null)

  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

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
  }, [profile])

  useEffect(() => {
    if (!user) return
    loadMyRequests()
  }, [user])

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
      .eq('id', user.id)

    setSavingProfile(false)
    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
    } else {
      setProfileMsg({ type: 'success', text: 'Saved.' })
      refreshProfile()
    }
  }

  // ── Avatar ──────────────────────────────────────────────────
  async function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5MB.')
      return
    }

    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, cacheControl: '3600' })

    if (uploadError) {
      setUploadingAvatar(false)
      setAvatarError(uploadError.message)
      return
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust so the new image shows immediately even at the same path
    const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)

    setUploadingAvatar(false)
    if (updateError) {
      setAvatarError(updateError.message)
    } else {
      refreshProfile()
    }
  }

  // ── Notification preferences ───────────────────────────────
  async function togglePref(key, value) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setPrefsSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: next })
      .eq('id', user.id)
    setPrefsSaving(false)
    if (error) {
      // Revert on failure
      setPrefs(prefs)
      alert('Could not save notification preference: ' + error.message)
    }
  }

  // ── Password ────────────────────────────────────────────────
  async function changePassword(e) {
    e.preventDefault()
    setPwMsg(null)

    if (pwForm.password.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' })
      return
    }
    if (pwForm.password !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.password })
    setPwSaving(false)

    if (error) {
      setPwMsg({ type: 'error', text: error.message })
    } else {
      setPwMsg({ type: 'success', text: 'Password updated.' })
      setPwForm({ password: '', confirm: '' })
    }
  }

  // ── Admin: direct role/category edit ───────────────────────
  async function saveAdminRoleCategory() {
    setAdminSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ role: adminRole, category: adminCategory || null })
      .eq('id', user.id)
    setAdminSaving(false)
    if (error) {
      alert('Could not save: ' + error.message)
    } else {
      refreshProfile()
    }
  }

  // ── Non-admin: request role/category change ────────────────
  async function submitChangeRequest(e) {
    e.preventDefault()
    setRequestMsg(null)

    if (!requestForm.value) {
      setRequestMsg({ type: 'error', text: 'Choose the new value you\u2019re requesting.' })
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

  if (!profile) return null

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Account</h1>
        <p className="mt-1 text-sm text-ink-muted">Manage your profile, notifications, and account security.</p>
      </div>

      {/* ── Profile ─────────────────────────────────────────── */}
      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Profile</h2>

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
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40">
                <span className="text-[10px] font-medium text-white">…</span>
              </div>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              {uploadingAvatar ? 'Uploading…' : 'Change photo'}
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
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
              {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
            {profileMsg && (
              <span className={`text-xs font-medium ${profileMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                {profileMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ── Role & category ─────────────────────────────────── */}
      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Role & category</h2>

        {isAdmin ? (
          <div className="space-y-4">
            <p className="text-xs text-ink-muted">As an admin, changes here apply immediately — no approval needed.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-text">Role</label>
                <select value={adminRole} onChange={e => setAdminRole(e.target.value)} className="input-field">
                  {ROLE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text">Category</label>
                <select value={adminCategory} onChange={e => setAdminCategory(e.target.value)} className="input-field">
                  <option value="">None</option>
                  {CATEGORY_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={saveAdminRoleCategory} disabled={adminSaving} className="btn-primary">
              {adminSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <span className="text-ink-muted">Current:</span>
              <span className="rounded-full bg-canvas-sunken px-2 py-0.5 text-xs font-medium">
                {ROLE_LABELS[profile.role] || profile.role}
              </span>
              {profile.category && (
                <span className="rounded-full bg-canvas-sunken px-2 py-0.5 text-xs font-medium">
                  {CATEGORY_LABELS[profile.category] || profile.category}
                </span>
              )}
            </div>

            {pendingRoleOrCategory ? (
              <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3 text-xs text-flagAmber">
                A {pendingRoleOrCategory.request_type} change to "{pendingRoleOrCategory.requested_value}" is pending admin review.
              </div>
            ) : (
              <form onSubmit={submitChangeRequest} className="space-y-3 rounded-lg border border-slate-line bg-canvas-sunken p-4">
                <p className="text-xs text-ink-muted">Role and category changes need admin approval.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-text">Change</label>
                    <select
                      value={requestForm.type}
                      onChange={e => setRequestForm(f => ({ ...f, type: e.target.value, value: '' }))}
                      className="input-field"
                    >
                      <option value="role">Role</option>
                      <option value="category">Category</option>
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
                      {(requestForm.type === 'role' ? ROLE_OPTIONS : CATEGORY_OPTIONS).map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
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
      </section>

      {/* ── Notification preferences ────────────────────────── */}
      <section className="card mb-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Notifications</h2>
          {prefsSaving && <span className="text-xs text-ink-muted">Saving…</span>}
        </div>
        <div className="divide-y divide-slate-line">
          {NOTIFICATION_ORDER.filter(key => key in prefs).map(key => (
            <div key={key} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-ink">{NOTIFICATION_LABELS[key] || key}</span>
              <Toggle checked={prefs[key] !== false} onChange={v => togglePref(key, v)} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Security ─────────────────────────────────────────── */}
      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Password</h2>
        <form onSubmit={changePassword} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pwSaving} className="btn-primary">
              {pwSaving ? 'Updating…' : 'Update password'}
            </button>
            {pwMsg && (
              <span className={`text-xs font-medium ${pwMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                {pwMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ── Request history ──────────────────────────────────── */}
      {myRequests.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Your requests</h2>
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
        </section>
      )}

      {/* ── Danger zone ──────────────────────────────────────── */}
      <section className="card border-flagRed/30 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-flagRed">Danger zone</h2>
        {pendingDeletion ? (
          <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3 text-xs text-flagAmber">
            Your account deletion request is pending admin review.
          </div>
        ) : deleteConfirming ? (
          <div className="rounded-lg border border-flagRed/30 bg-flagRed-bg p-4">
            <p className="mb-3 text-sm text-flagRed">
              This will send an account deletion request to an admin. Are you sure?
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
          <div>
            <p className="mb-3 text-xs text-ink-muted">
              Requesting deletion sends this to an admin for review — it isn\u2019t immediate, even for admin accounts.
            </p>
            <button
              onClick={() => setDeleteConfirming(true)}
              className="rounded border border-flagRed px-3 py-1.5 text-xs font-medium text-flagRed hover:bg-flagRed-bg"
            >
              Request account deletion
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
