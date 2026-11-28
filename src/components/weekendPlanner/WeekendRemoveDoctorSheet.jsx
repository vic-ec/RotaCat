import { Trash2 } from 'lucide-react'
import { ActionSheet, ActionSheetButton } from '../ActionSheet'
import { formatWeekendRange } from '../../lib/weekendPlanner'

// Part 5's "tap an assigned name" sheet — one action only (no swap-doctor:
// considered and explicitly rejected, remove-then-reassign covers it).
export default function WeekendRemoveDoctorSheet({ entry, doctor, saturday, groupLabel, onRemove, onClose }) {
  return (
    <ActionSheet title={`${doctor ? `${doctor.name} ${doctor.surname}` : 'Doctor'} — ${groupLabel}, ${formatWeekendRange(saturday)}`} onClose={onClose}>
      <ActionSheetButton danger icon={<Trash2 className="h-4 w-4" />} onClick={() => onRemove(entry.id)}>
        Remove from this weekend
      </ActionSheetButton>
    </ActionSheet>
  )
}
