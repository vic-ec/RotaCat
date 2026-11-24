import { CalendarX2, CircleCheck, History, Undo2 } from 'lucide-react'

// The persistent bar shown the whole time roster editing is on. Not
// dismissible: the only way off it is Done.
//
// Phone: one slim row fixed above the tab bar — "Editing" and the three
// buttons at the top bar's own 30px height, so the ⊕ (lifted by
// EDIT_BAR_HEIGHT) clears it with room to spare. Desktop: sticky tight
// under the page toolbar, the same button height as the toolbar's own
// controls, so the two read as one piece of chrome rather than two bars.
//
// Existing button classes only; no new colours — the flag colours stay for
// roster state.

// How far the phone's floating ⊕ lifts to clear the bar: its height plus a
// gap. Kept here beside the layout it measures.
export const EDIT_BAR_HEIGHT = 52

// `onAbsence`, when given, adds "Absence": capture leave, a course or any
// other time away for a doctor without leaving the roster — for rosters
// rebuilt from paper, where the absences live on the paper copy.
export default function RosterEditBar({ canUndo, undoing = false, onUndo, onHistory, onDone, onAbsence, notice = null }) {
  const btn = 'h-[30px] px-2.5 text-sm md:px-3'
  return (
    <div
      role="region"
      aria-label="Editing"
      data-testid="roster-edit-bar"
      className="fixed inset-x-0 bottom-[calc(54px+env(safe-area-inset-bottom))] z-[34] border-t border-slate-line bg-canvas-raised/95 px-3 py-2 backdrop-blur md:sticky md:inset-x-auto md:top-[56px] md:-mt-2 md:mb-3 md:rounded-xl md:border md:px-3 md:py-1.5 md:shadow-raised"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          <span className="font-semibold">Editing</span>
          <span className="hidden text-ink-muted sm:inline"> — each change saves straight away</span>
        </p>
        <div className="flex flex-shrink-0 items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo || undoing}
            className={`btn-secondary ${btn}`}
            title={canUndo ? 'Undo the last change you made' : 'Nothing to undo'}
          >
            <Undo2 className="h-4 w-4" />
            <span>{undoing ? 'Undoing…' : <><span className="md:hidden">Undo</span><span className="hidden md:inline">Undo last</span></>}</span>
          </button>
          {onAbsence && (
            <button type="button" onClick={onAbsence} className={`btn-secondary ${btn}`} title="Record leave, a course or other time away" aria-label="Record an absence">
              <CalendarX2 className="h-4 w-4" />
              <span className="hidden sm:inline">Absence</span>
            </button>
          )}
          <button type="button" onClick={onHistory} className={`btn-secondary ${btn}`} title="History" aria-label="History">
            <History className="h-4 w-4" />
            <span className={onAbsence ? 'hidden sm:inline' : ''}>History</span>
          </button>
          <button type="button" onClick={onDone} className={`btn-primary ${btn}`}>
            <CircleCheck className="h-4 w-4" />
            <span>Done</span>
          </button>
        </div>
      </div>
      {notice && (
        <p role="alert" className="mt-1 truncate text-xs text-ink-light">{notice}</p>
      )}
    </div>
  )
}
