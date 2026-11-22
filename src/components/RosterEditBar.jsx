import { CircleCheck, History, Undo2 } from 'lucide-react'

// The persistent bar shown the whole time roster editing is on. Not
// dismissible: the only way off it is Done. Fixed above the tab bar on a
// phone (the FAB moves up to clear it); sticky under the page toolbar from
// md up, where it replaces the floating "Done editing" button.
//
// Tap targets are 44px on a phone. Existing button classes only; no new
// colours — the flag colours stay for roster state.
export default function RosterEditBar({ canUndo, undoing = false, onUndo, onHistory, onDone, notice = null }) {
  const buttons = (
    <>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo || undoing}
        className="btn-secondary min-h-[44px] text-sm md:min-h-0"
        title={canUndo ? 'Undo the last change you made' : 'Nothing to undo'}
      >
        <Undo2 className="h-4 w-4" />
        <span>{undoing ? 'Undoing…' : <><span className="md:hidden">Undo</span><span className="hidden md:inline">Undo last</span></>}</span>
      </button>
      <button type="button" onClick={onHistory} className="btn-secondary min-h-[44px] text-sm md:min-h-0">
        <History className="h-4 w-4" />
        <span>History</span>
      </button>
      <button type="button" onClick={onDone} className="btn-primary min-h-[44px] text-sm md:min-h-0">
        <CircleCheck className="h-4 w-4" />
        <span>Done</span>
      </button>
    </>
  )

  return (
    <div
      role="region"
      aria-label="Editing"
      data-testid="roster-edit-bar"
      className="fixed inset-x-0 bottom-[calc(54px+env(safe-area-inset-bottom))] z-[34] border-t border-slate-line bg-canvas-raised/95 px-3 py-2 shadow-raised backdrop-blur md:sticky md:inset-x-auto md:top-[60px] md:-mx-0 md:mb-3 md:rounded-xl md:border md:px-3 md:py-2"
    >
      {/* The line sits above the buttons on a phone and beside them from
          md, where the bar is wide enough for both on one row. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          <span className="font-semibold">Editing</span>
          <span className="text-ink-muted"> — each change saves straight away</span>
        </p>
        <div className="flex items-center gap-2 md:flex-shrink-0 [&>button]:flex-1 md:[&>button]:flex-none">{buttons}</div>
      </div>
      {notice && (
        <p role="alert" className="mt-1.5 text-xs text-ink-light">{notice}</p>
      )}
    </div>
  )
}
