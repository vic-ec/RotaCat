import { CATEGORY_GROUPS, resolveWeekendCategoryForDoctor, formatWeekendRange } from '../../lib/weekendPlanner'
import DoctorDropdown from '../DoctorDropdown'

// The desktop table's cell editor (the roster's DoctorDropdown): add a
// doctor to a category, or swap / remove the one tapped.
export default function WeekendCellEditor({
  cellEditor, setCellEditor, cellEditorSearch, setCellEditorSearch, assignedDoctorIds, excusedBySaturday,
  assignableDoctors, rotationsByDoctorId, doctorById, entries, displayNames, removeEntry, addEntries,
}) {
  const group = CATEGORY_GROUPS.find(g => g.key === cellEditor.groupKey)
  const assigned = assignedDoctorIds(cellEditor.saturday)
  const excused = excusedBySaturday.get(cellEditor.saturday) ?? new Set()
  // Same eligibility as the add-doctors sheet: not already on this
  // weekend, not excused by an approved weekend off, and resolving to
  // this category on this date.
  const candidates = assignableDoctors
    .filter(d => !assigned.has(d.id) && !excused.has(d.id))
    .filter(d => resolveWeekendCategoryForDoctor({ doctor: d, targetDate: cellEditor.saturday, rotationsByDoctorId }).groupKey === cellEditor.groupKey)
    .sort((a, b) => a.surname.localeCompare(b.surname))
  const current = cellEditor.entryId ? doctorById.get(entries.find(e => e.id === cellEditor.entryId)?.profile_id) : null
  return (
    <DoctorDropdown
      profiles={candidates}
      displayNames={displayNames}
      search={cellEditorSearch}
      onSearchChange={setCellEditorSearch}
      date={formatWeekendRange(cellEditor.saturday)}
      shiftCode={current ? `${displayNames.get(current.id) ?? current.surname} (${group?.label})` : group?.label}
      removeLabel={current ? `Remove ${displayNames.get(current.id) ?? current.surname} from this weekend` : 'Remove from this weekend'}
      onSelect={async profileId => {
        const { saturday, groupKey, entryId } = cellEditor
        setCellEditor(null)
        if (entryId) await removeEntry(entryId)
        addEntries(saturday, groupKey, [profileId])
      }}
      onRemove={cellEditor.entryId ? () => { const id = cellEditor.entryId; setCellEditor(null); removeEntry(id) } : undefined}
      onClose={() => setCellEditor(null)}
    />
  )
}
