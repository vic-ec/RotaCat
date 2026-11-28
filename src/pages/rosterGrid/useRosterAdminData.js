import { useEffect, useState } from 'react'
import { monthBounds } from '../../lib/dateRange'
import { fetchLateArrivalsInRange } from '../../lib/lateArrivals'
import { fetchLatestChangeByEntry } from '../../lib/changeLog'
import { fetchLocumProfiles, fetchOpenLocumContacts } from '../../lib/locumCover'

// What only an admin reads on the roster: each entry's newest change (for
// the edit marker's hint), late arrivals, and the locums the roster can
// assign. Moved out of RosterGridPage as it was.
export function useRosterAdminData({ id, isAdmin, rosterMonth, entries }) {
  // The newest change to each entry (admins), for the edit marker's hint.
  const [latestChanges, setLatestChanges] = useState(() => new Map())
  // Late arrivals (admins only; nobody else can read them). Logged from a
  // tap on a name WITHOUT Edit mode, or from the shift menu while editing.
  // Kept apart from the roster's own edits: no undo batch, no change log.
  const [lateByEntryId, setLateByEntryId] = useState(new Map())
  // Locums the roster can assign: those with an account, and those added
  // from here with only a name and mobile (locum contacts — admin-only).
  const [locumProfiles, setLocumProfiles] = useState([])
  const [locumContacts, setLocumContacts] = useState([])

  async function refreshLateArrivals() {
    if (!isAdmin || !rosterMonth) return
    try {
      const { start, end } = monthBounds(rosterMonth.year, rosterMonth.month)
      const rows = await fetchLateArrivalsInRange(start, end)
      setLateByEntryId(new Map(rows.filter(r => r.roster_entry_id).map(r => [r.roster_entry_id, r])))
    } catch {
      setLateByEntryId(new Map()) // ahead of the migration, or offline: no markers
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per roster
  useEffect(() => { refreshLateArrivals() }, [rosterMonth?.id, isAdmin])

  // Re-read whenever the entries do (after every edit), so a marker's hint
  // names the newest change.
  useEffect(() => {
    if (!isAdmin || !id) return undefined
    let cancelled = false
    fetchLatestChangeByEntry(id).then(map => { if (!cancelled) setLatestChanges(map) })
    return () => { cancelled = true }
  }, [id, isAdmin, entries])

  async function refreshLocums() {
    const [accounts, open] = await Promise.all([fetchLocumProfiles(), fetchOpenLocumContacts()])
    setLocumProfiles(accounts)
    setLocumContacts(open)
  }
  // Only an admin can assign anyone, and the contact list is theirs
  // alone to read.
  useEffect(() => {
    if (isAdmin) refreshLocums()
  }, [isAdmin])

  return { latestChanges, lateByEntryId, refreshLateArrivals, locumProfiles, locumContacts, refreshLocums }
}
