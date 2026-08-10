import { useEffect, useState } from 'react'
import RosterVacancyModal from './RosterVacancyModal'

// Owns the recursive stack for the published-roster removal/reassignment
// workflow (§2.5). Seeded with one vacancy; each resolution either finishes
// (stack empties -> onDone) or, if a "swap" creates a same-day conflict for
// the swapped-in doctor's own shift, pushes that shift as the next vacancy
// to resolve — re-entrant until the whole chain is cleared.
export default function RosterVacancyManager({ vacancy, entries, shiftTypes, profiles, displayNames, rosterMonthId, onDone }) {
  const [stack, setStack] = useState([vacancy])
  const [workingEntries, setWorkingEntries] = useState(entries)

  useEffect(() => {
    if (stack.length === 0) onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack])

  function handleResolved(nextVacancy, updatedEntries) {
    setWorkingEntries(updatedEntries)
    setStack(s => {
      const rest = s.slice(1)
      return nextVacancy ? [nextVacancy, ...rest] : rest
    })
  }

  const current = stack[0]
  if (!current) return null

  return (
    <RosterVacancyModal
      key={current.entryId}
      vacancy={current}
      entries={workingEntries}
      shiftTypes={shiftTypes}
      profiles={profiles}
      displayNames={displayNames}
      rosterMonthId={rosterMonthId}
      onResolved={handleResolved}
      onClose={onDone}
    />
  )
}
