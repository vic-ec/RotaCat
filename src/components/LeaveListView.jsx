import { useEffect, useState } from 'react'
import { LayoutGrid, UserRoundX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsDesktop } from '../lib/useIsDesktop'
import ViewToggle from './ViewToggle'
import LeaveMatrix from './LeaveMatrix'
import WhosAwayList from './WhosAwayList'

const VIEW_OPTIONS = [
  { key: 'matrix', label: 'Matrix', icon: LayoutGrid },
  { key: 'away', label: "Who's away", icon: UserRoundX },
]

// Persist the wide-screen Matrix / Who's away choice so it survives a
// reopen or tab switch. 'table' is the old name for the list's slot.
const DESKTOP_VIEW_KEY = 'rotacat:leaveTeamDesktopView'

// Team Leave → Current & Upcoming. Intentionally has NO role-conditional
// filtering — the leave_select RLS policy already scopes rows per role
// (requester sees own always; other doctors see others' only once approved;
// clerk sees all approved leave; locum sees nothing — this route is
// locum-blocked before it renders; admin sees all). One fetch feeds both
// views: the year Matrix (wide screens only) and Who's away, the list every
// width gets (see WhosAwayList). The full history, rejected and cancelled
// included, is All Leave's.
export default function LeaveListView({ leading = null, onCapture }) {
  const { isAdmin } = useAuth()
  const isWide = useIsDesktop(1024)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState(() => {
    try {
      const stored = localStorage.getItem(DESKTOP_VIEW_KEY)
      return stored === 'away' || stored === 'table' ? 'away' : 'matrix'
    } catch { return 'matrix' }
  })
  useEffect(() => {
    try { localStorage.setItem(DESKTOP_VIEW_KEY, view) } catch { /* ignore */ }
  }, [view])

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

  const viewToggle = <ViewToggle view={view} onChange={setView} options={VIEW_OPTIONS} />

  if (isWide && view === 'matrix') {
    return <LeaveMatrix requests={requests} controls={viewToggle} leading={leading} canCancelLeave={isAdmin} onLeaveCancelled={load} />
  }
  return (
    <WhosAwayList
      requests={requests}
      leading={leading}
      onCapture={onCapture}
      controls={isWide ? viewToggle : null}
      canCancelLeave={isAdmin}
      onLeaveCancelled={load}
    />
  )
}
