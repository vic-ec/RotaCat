import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchOpenLocumContacts } from '../../lib/locumCover'
import { todayStr } from '../../lib/dateRange'
import { fetchInternRotationsForDoctorIds } from '../../lib/internRotations'

// Everything the Staff list reads: the accounts, sign-ups, change requests,
// emails, who is on leave, rotation end dates and the deletion log, with
// the reload on mount and on every location change. Moved out of StaffListPage as it was.
export function useStaffData({ isAdmin, location }) {
  const [activeAccounts, setActiveAccounts] = useState([])
  const [pending, setPending] = useState([])
  // Locums on the roster with no account (admin-only read; see
  // LocumContactsPanel). Counted here for the tab badge and the notice.
  const [locumContactCount, setLocumContactCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
  // Ids from never_signed_in_profile_ids() (admin only).
  const [neverSignedInIds, setNeverSignedInIds] = useState(() => new Set())
  const [accountRequests, setAccountRequests] = useState([])

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

  return {
    activeAccounts, pending, locumContactCount, setLocumContactCount, loading, error, emailById,
    leaveProfileIds, leaveDatesById, deletionLog, neverSignedInIds, accountRequests, loadAll, activeUntilFor,
  }
}
