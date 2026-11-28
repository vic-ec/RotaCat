import { MessageSquareWarning, MoreVertical } from 'lucide-react'
import { CATEGORY_GROUPS, weekendCoverageSummary, isEvenWeekend, formatWeekendRange } from '../../lib/weekendPlanner'
import { weekendStatusPill, myRequestLine } from './viewHelpers'
import Tag from '../Tag'
import MobileRoleRow from './MobileRoleRow'

// One weekend's card in the phone's month list.
export default function WeekendMobileCard({
  saturday, byWeekend, myRequestsBySaturday, clipboard, cardRefs, selectedSaturday, setSelectedSaturday,
  setDetailSaturday, monthSaturdays, myName, exceptionsBySaturday, setExceptionsSaturday, isAdmin,
  setCardMenuSaturday, doctorById, displayNames, setOpenRolePicker,
}) {
  const bySaturday = byWeekend.get(saturday) || {}
  const coverage = weekendCoverageSummary(bySaturday)
  const myRequest = myRequestsBySaturday.get(saturday)
  const even = isEvenWeekend(saturday)
  const statusPill = weekendStatusPill(coverage)
  const isClipboardSource = clipboard?.granularity === 'weekend' && clipboard.sourceSaturday === saturday

  return (
    <div
      key={saturday}
      ref={el => { if (el) cardRefs.current.set(saturday, el); else cardRefs.current.delete(saturday) }}
      data-testid="weekend-card"
      data-selected={selectedSaturday === saturday || undefined}
      onClick={() => setSelectedSaturday(saturday)}
      /* Tapping anywhere on the card selects the weekend — the
         target for a paste from the ⊕ or the More menu. The
         selected card gets the accent ring; the one the
         clipboard was copied from, a dashed outline. */
      className={`card cursor-pointer border-l-4 p-4 ${even ? 'border-l-groupEven' : 'border-l-groupOdd'} ${
        selectedSaturday === saturday ? 'ring-2 ring-accent' : ''
      } ${isClipboardSource ? 'outline-dashed outline-2 outline-offset-2 outline-accent' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Tapping the date opens a read-only quick-glance sheet
              (WeekendDetailSheet) — a condensed alternative to
              scrolling this card's own always-expanded, fully
              editable breakdown below, not a replacement for it. */}
          <button
            type="button"
            onClick={() => setDetailSaturday(saturday)}
            className="text-sm font-medium text-ink underline decoration-dotted underline-offset-2"
          >
            {formatWeekendRange(saturday)}
          </button>
          <p className="mt-0.5 text-xs text-ink-muted">
            Wknd {monthSaturdays.indexOf(saturday) + 1} · {even ? 'Even' : 'Odd'}
          </p>
          {myRequest && (
            <p className="mt-0.5 text-xs font-semibold text-ink-light">
              {myRequestLine(myRequest.status, myName)}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Tag variant="status" tone={statusPill.tone}>{statusPill.label}</Tag>
          {/* Right of the status pill, left of the kebab. Tapping
              it opens that weekend's requests rather than only
              flagging that some exist. */}
          {exceptionsBySaturday.has(saturday) && (
            <button
              type="button"
              onClick={() => setExceptionsSaturday(saturday)}
              aria-label={`Weekend off requests for ${saturday}`}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-flagAmber hover:bg-canvas-sunken"
            >
              <MessageSquareWarning className="h-4 w-4" />
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCardMenuSaturday(saturday)}
              aria-label={`More actions for weekend ${saturday}`}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 divide-y divide-slate-line">
        {CATEGORY_GROUPS.map(group => (
          <MobileRoleRow
            key={group.key}
            group={group}
            groupEntries={bySaturday[group.key] || []}
            doctorById={doctorById}
            displayNames={displayNames}
            isAdmin={isAdmin}
            onOpenPicker={() => setOpenRolePicker({ saturday, groupKey: group.key })}
            onOpenRemove={entry => setOpenRolePicker({ saturday, groupKey: group.key, replaceEntryId: entry.id })}
          />
        ))}
      </div>
    </div>
  )
}
