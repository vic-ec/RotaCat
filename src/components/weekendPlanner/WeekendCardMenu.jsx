import { Copy, ClipboardPaste, Trash2 } from 'lucide-react'
import { ActionSheet, ActionSheetButton } from '../ActionSheet'
import { formatWeekendRange } from '../../lib/weekendPlanner'

// Part 6's per-card ⋮ menu — Copy/Paste/Clear for exactly this weekend,
// reusing the same copyWeekend/openWeekendPaste/setClearWeekendTarget
// mutation functions the desktop inspector already uses (see
// WeekendPlannerView's own file-level comment), not a parallel mobile
// implementation.
export default function WeekendCardMenu({ saturday, hasClipboard, isSourceCard, canCopy, onCopy, onPaste, onClear, onClose }) {
  return (
    <ActionSheet title={formatWeekendRange(saturday)} onClose={onClose}>
      <ActionSheetButton icon={<Copy className="h-4 w-4" />} disabled={!canCopy} onClick={onCopy}>Copy weekend</ActionSheetButton>
      <ActionSheetButton icon={<ClipboardPaste className="h-4 w-4" />} disabled={!hasClipboard || isSourceCard} onClick={onPaste}>Paste here</ActionSheetButton>
      <ActionSheetButton danger icon={<Trash2 className="h-4 w-4" />} disabled={!canCopy} onClick={onClear}>Clear weekend</ActionSheetButton>
    </ActionSheet>
  )
}
