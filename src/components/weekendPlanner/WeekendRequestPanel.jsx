import DateStepper from '../DateStepper'
import PlannerRequestPanel from '../PlannerRequestPanel'
import SelectMenu from '../SelectMenu'

  // The month stepper, "Showing", and the one action this page never
  // offered, in the same panel shape the other two planners use — the year
  // view moved its own stepper and picker into this panel too, so the
  // controls sit beside the request they frame rather than loose in a
  // toolbar. Weekends report no capacity, so there's no reading. Always
  // rendered: even a viewer with one scope and no request to make needs
  // the stepper, which lives nowhere else on this page now.
export default function WeekendRequestPanel({ id, className, viewYear, viewMonth, goToMonth, setRequestOpen, filters, filter, setFilter }) {
  return (
    <PlannerRequestPanel
      className={className}
      eyebrow="Weekends · Month"
      stepper={<DateStepper unit="month" year={viewYear} month={viewMonth} onChange={goToMonth} showToday={false} centered />}
      actionLabel="Request weekend off"
      onAction={() => setRequestOpen(true)}
    >
      {filters.length > 1 && (
        <>
          <label htmlFor={id} className="mt-2 block text-[11px] font-semibold text-ink-muted">Showing</label>
          <div className="mt-1">
            <SelectMenu
              id={id}
              value={filter}
              onChange={setFilter}
              options={filters.map(f => ({ value: f.key, label: f.label }))}
            />
          </div>
        </>
      )}
    </PlannerRequestPanel>
  )
}
