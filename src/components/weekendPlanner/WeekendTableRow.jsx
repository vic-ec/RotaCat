import { MessageSquareWarning } from 'lucide-react'
import { CATEGORY_GROUPS, formatWeekendRange } from '../../lib/weekendPlanner'
import { weekendBadge } from './viewHelpers'

// One weekend's row in the desktop table.
export default function WeekendTableRow({
  saturday, byWeekend, monthSaturdays, inspectorSaturday, isAdmin, editingSaturday, setSelectedSaturday,
  exceptionsBySaturday, setExceptionsSaturday, doctorById, displayNames, swatch, saving, setCellEditorSearch,
  setCellEditor,
}) {
  const bySaturday = byWeekend.get(saturday) || {}
  const badge = weekendBadge(saturday, monthSaturdays.indexOf(saturday) + 1)
  const isSelected = saturday === inspectorSaturday
  const isEditing = isAdmin && isSelected && editingSaturday === saturday

  return (
    <tr
      key={saturday}
      onClick={() => setSelectedSaturday(saturday)}
      aria-selected={isSelected}
      className="group cursor-pointer"
    >
      {/* Sticky column needs an OPAQUE background — unlike the rest of
          the row, it must occlude the non-sticky cells (e.g. MO) that
          scroll underneath it, so it can't reuse the row's translucent
          tint opacity modifier (that let their text ghost through
          beneath the date). */}
      <td className={`sticky left-0 z-10 whitespace-nowrap rounded-l-lg border-y border-l-4 px-4 py-4 font-medium text-ink ${
        isSelected ? (isEditing ? 'border-y-rose border-l-rose bg-rose-tint' : 'border-y-accent border-l-accent bg-accent-tint') : 'border-y-slate-line border-l-slate-line bg-canvas-raised group-hover:bg-canvas-sunken'
      }`}>
        <div className="flex flex-col gap-1">
          <span>{formatWeekendRange(saturday)}</span>
          <span className="flex items-center gap-1.5">
            <span className={`inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.chip}`}>{badge.label}</span>
            {exceptionsBySaturday.has(saturday) && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setExceptionsSaturday(saturday) }}
                aria-label={`Weekend off requests for ${saturday}`}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-flagAmber hover:bg-canvas-sunken"
              >
                <MessageSquareWarning className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
      </td>
      {CATEGORY_GROUPS.map((group, gi) => {
        const groupEntries = bySaturday[group.key] || []
        const last = gi === CATEGORY_GROUPS.length - 1
        return (
          <td key={group.key} className={`border-y px-4 py-4 align-top ${last ? 'rounded-r-lg border-r' : ''} ${isSelected ? (isEditing ? 'border-rose bg-rose-tint' : 'border-accent bg-accent-tint') : 'border-slate-line bg-canvas-raised group-hover:bg-canvas-sunken'}`}>
            {/* The roster's own cell layout: one pill per
                doctor with their colour as a left rail,
                and a dashed "+" pill under the list. While
                the row is being edited a pill opens the
                shared doctor picker (swap, or remove from
                this weekend); otherwise an empty category
                reads "Open". */}
            <div className="space-y-1">
              {groupEntries.map(e => {
                const doctor = doctorById.get(e.profile_id)
                const label = displayNames.get(e.profile_id) ?? doctor?.surname ?? '(unknown)'
                const pill = `flex items-center whitespace-nowrap rounded-sm border border-slate-line border-l-[3px] bg-canvas-raised px-1.5 py-0.5 text-[0.834em] font-medium text-ink ${isEditing ? 'cursor-pointer hover:bg-canvas-sunken' : ''}`
                const rail = { borderLeftColor: swatch.stroke(doctor?.color_code || '#4A90D9') }
                return isEditing ? (
                  <button
                    key={e.id}
                    type="button"
                    onClick={ev => { ev.stopPropagation(); setCellEditorSearch(''); setCellEditor({ saturday, groupKey: group.key, entryId: e.id }) }}
                    disabled={saving}
                    aria-label={`Edit ${label} on ${saturday}`}
                    className={`${pill} w-full text-left`}
                    style={rail}
                  >
                    <span className="truncate">{label}</span>
                  </button>
                ) : (
                  <div key={e.id} className={pill} style={rail} title={doctor ? `${doctor.name} ${doctor.surname}` : undefined}>
                    <span className="truncate">{label}</span>
                  </div>
                )
              })}
              {groupEntries.length === 0 && !isEditing && (
                <span className="inline-flex items-center rounded-full bg-flagAmber-bg px-2 py-0.5 text-[0.834em] font-medium text-flagAmber">Open</span>
              )}
              {isEditing && (
                <button
                  type="button"
                  onClick={ev => { ev.stopPropagation(); setCellEditorSearch(''); setCellEditor({ saturday, groupKey: group.key, entryId: null }) }}
                  disabled={saving}
                  aria-label={`Add a doctor to ${group.label} on ${saturday}`}
                  className="flex w-full items-center justify-center rounded border border-dashed border-accent/70 bg-canvas-raised/70 py-0.5 text-[0.834em] font-bold text-accent-dark hover:border-accent hover:bg-accent-light disabled:opacity-50"
                >
                  +
                </button>
              )}
            </div>
          </td>
        )
      })}
    </tr>
  )
}
