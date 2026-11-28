import { AlarmClock } from 'lucide-react'
import { ActionSheet, ActionSheetButton } from '../../components/ActionSheet'
import { lateByLabel } from '../../lib/lateArrivals'

// A name tapped outside Edit mode (admins): Log late arrival, or edit the
// one already logged. Moved out of RosterGridPage as it was.
export default function LatePromptSheet({ latePrompt, setLatePrompt, setLateFor, lateByEntryId }) {
  return (
    <ActionSheet title={`${latePrompt.name} · ${latePrompt.label.split(' · ').pop()}`} onClose={() => setLatePrompt(null)}>
      <ActionSheetButton
        icon={<AlarmClock className="h-4 w-4" aria-hidden="true" />}
        onClick={() => { setLateFor(latePrompt); setLatePrompt(null) }}
      >
        {lateByEntryId.has(latePrompt.entryId)
          ? `Late arrival · ${lateByLabel(lateByEntryId.get(latePrompt.entryId).minutes_late)} — edit`
          : 'Log late arrival'}
      </ActionSheetButton>
    </ActionSheet>
  )
}
