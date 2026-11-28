import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import WhosAwayList from './WhosAwayList'

// Team Leave → Current & Upcoming. Intentionally has NO role-conditional
// filtering — the leave_select RLS policy already scopes rows per role
// (requester sees own always; other doctors see others' only once approved;
// clerk sees all approved leave; locum sees nothing — this route is
// locum-blocked before it renders; admin sees all). One fetch feeds Who's
// away (see WhosAwayList). The year as a timeline, with the day
// counts, is All Leave's Month view.
export default function LeaveListView({ leading = null, onCapture }) {
  const { isAdmin } = useAuth()
  // An old link into one doctor's leave on the retired Matrix
  // (?ldoctor=&lyear=&lrequest=) now opens All Leave on that year with the
  // leave's details (see LeaveAuditReport).
  const [searchParams, setSearchParams] = useSearchParams()
  const lrequest = searchParams.get('lrequest')
  const lyear = searchParams.get('lyear')
  useEffect(() => {
    if (!lrequest && !searchParams.get('ldoctor')) return
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.set('sub', 'all')
      p.delete('ldoctor')
      if (lyear) p.set('lyear', lyear)
      return p
    }, { replace: true })
  }, [lrequest, lyear, searchParams, setSearchParams])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type, color_code, avatar_url, pattern_type), reviewer:profiles!leave_requests_reviewed_by_fkey(name, surname), canceller:profiles!leave_requests_cancelled_by_fkey(name, surname), submitter:profiles!leave_requests_submitted_by_fkey(name, surname)')
      .order('date_from', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setLoading(false)
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <p className="text-sm text-flagRed">{error}</p>

  return (
    <WhosAwayList
      requests={requests}
      leading={leading}
      onCapture={onCapture}
      canCancelLeave={isAdmin}
      onLeaveCancelled={load}
    />
  )
}
