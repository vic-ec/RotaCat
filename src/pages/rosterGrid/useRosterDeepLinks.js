import { useEffect, useRef, useState } from 'react'
import { leaveRangeOn } from '../../lib/approvedLeave'

// Where the page lands and what it opens: a jumped-to entry or day
// scrolled into view, today on opening this month's roster, and the links
// that arrive with ?publish=1, ?report=1, ?history=1 or ?date=…
// Moved out of RosterGridPage as it was.
export function useRosterDeepLinks({
  layout, setLayout, currentWeek, setCurrentWeek, viewMode, rosterMonth, loading, searchParams, setSearchParams,
  isAdmin, entries, weeks, shiftTypes, leaveByProfile, setMarkedDate, setEditing, setActiveVacancy, setMenu,
  setShowPublishConfirm, setShowGenerationReport, setShowChangeLog,
}) {
  // The jump's own state (see where `jump` is declared in RosterGridPage).
  const [pendingJumpId, setPendingJumpId] = useState(null)
  const [glowEntryId, setGlowEntryId] = useState(null)
  const [pendingJumpDate, setPendingJumpDate] = useState(null) // a day to scroll to, with no entry to light

  // Scroll a jumped-to entry into the middle of the screen once it is on
  // it — after a switch to Rows or to another week has rendered — and let
  // it glow for a moment so the eye lands on it.
  useEffect(() => {
    if (!pendingJumpId) return undefined
    const el = document.querySelector(`[data-entry-id="${pendingJumpId}"]`)
    if (!el) return undefined
    el.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' })
    setGlowEntryId(pendingJumpId)
    setPendingJumpId(null)
    const t = setTimeout(() => setGlowEntryId(null), 2200)
    return () => clearTimeout(t)
  }, [pendingJumpId, layout, currentWeek, viewMode])

  useEffect(() => {
    if (!pendingJumpDate) return
    const el = document.querySelector(`[data-testid="day-row"][data-date="${pendingJumpDate}"]`)
    if (!el) return
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setPendingJumpDate(null)
  }, [pendingJumpDate, layout, currentWeek, viewMode])
  // Opening a roster: this month's lands on today, centred; any other
  // month starts at its first day. Once per roster, and not when a link
  // already says which day to show (?date=).
  const openedRosterRef = useRef(null)
  useEffect(() => {
    if (!rosterMonth || loading || openedRosterRef.current === rosterMonth.id) return
    openedRosterRef.current = rosterMonth.id
    if (searchParams.get('date')) return
    const now = new Date()
    if (rosterMonth.year === now.getFullYear() && rosterMonth.month === now.getMonth() + 1) {
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      setPendingJumpDate(today)
    } else {
      try { window.scrollTo({ top: 0 }) } catch { /* jsdom */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per roster opened
  }, [rosterMonth?.id, loading])

  // Dashboard's Publish action: land here with the confirmation open, then
  // drop the flag from the URL so a reload doesn't ask again.
  useEffect(() => {
    if (!rosterMonth || !isAdmin || searchParams.get('publish') !== '1') return
    if (rosterMonth.status === 'draft') setShowPublishConfirm(true)
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('publish'); return next }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the roster has loaded
  }, [rosterMonth?.id])

  // Straight from the Generate page: open the engine's report on arrival,
  // then drop the flag so a reload doesn't reopen it.
  useEffect(() => {
    if (!rosterMonth || !isAdmin || searchParams.get('report') !== '1') return
    setShowGenerationReport(true)
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('report'); return next }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the roster has loaded
  }, [rosterMonth?.id])

  // Linked from My year ("Roster change history"): open History on
  // arrival, then drop the flag so a reload doesn't reopen it.
  useEffect(() => {
    if (!rosterMonth || !isAdmin || searchParams.get('history') !== '1') return
    setShowChangeLog(true)
    // With ?date= as well, the effect below clears both in one write: two
    // separate writes in the same tick would each start from the same
    // stale params and the second would put the first one's back.
    if (searchParams.get('date')) return
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('history'); return next }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the roster has loaded
  }, [rosterMonth?.id])

  // Linked from a leave capture ("Go to roster"): ?date=YYYY-MM-DD, plus
  // &doctor=<profile id> for whose shift it is. Lands on that day in Rows,
  // on the right week, with the doctor's shift lit up — or just the day if
  // they hold no shift there any more. Dropped from the URL afterwards so a
  // reload doesn't jump again.
  useEffect(() => {
    const date = searchParams.get('date')
    if (!rosterMonth || loading || !date) return
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const doctor = searchParams.get('doctor')
      // &entry=<roster entry id>: a particular row (a locum contact's shift,
      // which has no profile to match on).
      const entryId = searchParams.get('entry')
      const target = (entryId && entries.find(e => e.id === entryId))
        || (doctor ? entries.find(e => e.date === date && e.profile_id === doctor) : null)
      if (layout !== 'rows') setLayout('rows')
      if (viewMode === 'week') {
        const week = weeks.findIndex(w => w.some(d => d.dateStr === date))
        if (week >= 0) setCurrentWeek(week)
      }
      if (target) setPendingJumpId(target.id)
      else setPendingJumpDate(date)
      setMarkedDate(searchParams.get('mark') === '1' ? date : null)
      // &cover=1 (from Capture leave or the dashboard): open that shift's
      // cover decision straight away — the vacancy form on a published
      // roster, with the leave already linked; the shift menu on a draft.
      if (searchParams.get('cover') === '1' && isAdmin && target?.profile_id && !target.is_locum) {
        const shiftCode = shiftTypes[target.shift_type_id] || 'UNKNOWN'
        setEditing(true)
        if (rosterMonth.status === 'published') {
          const range = leaveRangeOn(leaveByProfile, target.profile_id, date)
          setActiveVacancy({ entryId: target.id, date, shiftCode, currentProfileId: target.profile_id, suggestedReason: range?.[2] === 'sick' ? 'sick' : 'leave' })
        } else {
          setMenu({ date, shiftCode, entry: target, anchorRect: null })
        }
      }
    }
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('date'); next.delete('doctor'); next.delete('entry'); next.delete('history'); next.delete('cover'); next.delete('mark'); return next }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the roster has loaded
  }, [rosterMonth?.id, loading])

  return { glowEntryId, setPendingJumpId }
}
