import { useMemo, useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import Modal from './Modal'
import ProfileAvatar, { StatusBadge } from './ProfileAvatar'
import SectionLabel from './SectionLabel'
import TeamLeavePersonRow from './TeamLeavePersonRow'
import FilterPanel from './FilterPanel'
import { QuickSelectButton } from './Toolbar'
import { buildPeopleLeave } from '../lib/teamLeaveMobile'
import { todayStr, formatShortDateRange } from '../lib/dateRange'
import { columnForLeaveCategory, LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'
import { LEAVE_TYPE_OPTIONS, shortLeaveTypeLabel } from '../lib/leaveRequests'

const CATEGORY_GROUPS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Newest-first is the default — same "most recent/relevant first" ordering
// as LeaveListView's own Sort facet — with Oldest first as the one
// alternative, exactly the two options asked for.
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
]

const EMPTY_SHEET_FILTERS = { leaveType: new Set(), month: new Set(), year: new Set() }

function fullName(doctor) {
  return `${doctor.name || ''} ${doctor.surname || ''}`.trim() || doctor.surname || 'Unknown'
}

function groupKeyForDoctor(doctor) {
  return columnForLeaveCategory(doctor.category, doctor.contract_type) ?? LEAVE_OTHER_COLUMN.key
}

function PersonRow({ person, onOpen }) {
  const { doctor, current, next } = person
  // Naming the leave type is the point of these two lines — "On leave" and
  // "Next" said only *that* someone is away, never what for, which is the
  // first thing an admin scanning this list wants. Lower-cased because the
  // label is mid-sentence here ("On maternity", not "On Maternity"), and
  // shortened because the surrounding words already carry "leave".
  const rightLabel = current
    ? `On ${shortLeaveTypeLabel(current.leave_type).toLowerCase()} · ${formatShortDateRange(current.date_from, current.date_to)}`
    : next
      ? `Upcoming ${shortLeaveTypeLabel(next.leave_type).toLowerCase()} · ${formatShortDateRange(next.date_from, next.date_to)}`
      : 'No upcoming leave'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-canvas-sunken"
      style={{ minHeight: 44 }}
    >
      <span className="relative flex-shrink-0">
        <ProfileAvatar profile={doctor} size={40} />
        {current && <StatusBadge active onLeave size={12} className="absolute -bottom-0.5 -right-0.5 border-2 border-canvas-raised" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{fullName(doctor)}</span>
        <span className={`block truncate text-xs ${current ? 'text-accent' : 'text-ink-muted'}`}>{rightLabel}</span>
      </span>
    </button>
  )
}

// "When is Dr X away?" — every person currently on leave or due to go,
// searchable by name and grouped by category, each showing their current or
// next leave (buildPeopleLeave already drops anyone who's returned, with
// nothing current or upcoming left to show). Tapping a person opens a sheet
// of all their leave (newest first by default, sortable/filterable by leave
// type/month/year); tapping one of those opens its full detail.
export default function TeamLeavePeopleView({ requests, onSelectLeave }) {
  const [sheetPerson, setSheetPerson] = useState(null)
  // Sort/filter apply within one person's own sheet only — reset whenever a
  // (possibly different) person's sheet is opened, so switching from
  // reviewing one person to another doesn't carry over a stale filter that
  // might hide everything for the next person.
  const [sheetSort, setSheetSort] = useState('date_desc')
  const [sheetFilters, setSheetFilters] = useState(EMPTY_SHEET_FILTERS)
  const today = todayStr()
  const people = useMemo(() => buildPeopleLeave(requests, today), [requests, today])

  const groups = CATEGORY_GROUPS
    .map(g => ({ key: g.key, label: g.label, items: people.filter(p => groupKeyForDoctor(p.doctor) === g.key) }))
    .filter(g => g.items.length > 0)

  function openSheet(person) {
    setSheetPerson(person)
    setSheetSort('date_desc')
    setSheetFilters(EMPTY_SHEET_FILTERS)
  }

  // Month/Year options are this person's own leave dates only, not every
  // date in the app — same "only offer values that actually occur"
  // convention as LeaveListView's own Month/Year filters.
  const sheetMonthOptions = sheetPerson
    ? [...new Set(sheetPerson.items.map(r => r.date_from?.slice(5, 7)).filter(Boolean))]
      .sort()
      .map(m => ({ value: m, label: MONTH_NAMES[Number(m) - 1] }))
    : []
  const sheetYearOptions = sheetPerson
    ? [...new Set(sheetPerson.items.map(r => r.date_from?.slice(0, 4)).filter(Boolean))]
      .sort()
      .reverse()
      .map(y => ({ value: y, label: y }))
    : []
  const sheetFilterGroups = [
    { key: 'leaveType', label: 'Leave Type', options: LEAVE_TYPE_OPTIONS, selected: sheetFilters.leaveType, onChange: next => setSheetFilters(f => ({ ...f, leaveType: next })) },
    { key: 'month', label: 'Month', options: sheetMonthOptions, selected: sheetFilters.month, onChange: next => setSheetFilters(f => ({ ...f, month: next })) },
    { key: 'year', label: 'Year', options: sheetYearOptions, selected: sheetFilters.year, onChange: next => setSheetFilters(f => ({ ...f, year: next })) },
  ]
  const sheetFiltersActive = sheetFilters.leaveType.size > 0 || sheetFilters.month.size > 0 || sheetFilters.year.size > 0

  const sheetItems = sheetPerson
    ? sheetPerson.items
      .filter(r => sheetFilters.leaveType.size === 0 || sheetFilters.leaveType.has(r.leave_type))
      .filter(r => sheetFilters.month.size === 0 || sheetFilters.month.has(r.date_from?.slice(5, 7)))
      .filter(r => sheetFilters.year.size === 0 || sheetFilters.year.has(r.date_from?.slice(0, 4)))
      .sort((a, b) => sheetSort === 'date_asc' ? a.date_from.localeCompare(b.date_from) : b.date_from.localeCompare(a.date_from))
    : []

  return (
    <div className="mt-4">
      {groups.length === 0 ? (
        <p className="text-sm text-ink-muted">No matching staff.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.key}>
              <SectionLabel>{group.label}</SectionLabel>
              <div className="space-y-0.5">
                {group.items.map(person => (
                  <PersonRow key={person.doctor.id} person={person} onOpen={() => openSheet(person)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {sheetPerson && (
        <Modal title={fullName(sheetPerson.doctor)} onClose={() => setSheetPerson(null)}>
          {sheetPerson.items.length === 0 ? (
            <p className="text-sm text-ink-muted">No leave on record.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <QuickSelectButton
                  icon={<ArrowUpDown className="h-4 w-4" />}
                  label="Sort"
                  value={sheetSort}
                  onChange={setSheetSort}
                  options={SORT_OPTIONS}
                  isActive={sheetSort !== 'date_desc'}
                />
                <FilterPanel groups={sheetFilterGroups} />
              </div>
              {sheetItems.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="mb-2 text-sm text-ink-muted">No leave matches these filters.</p>
                  {sheetFiltersActive && (
                    <button type="button" onClick={() => setSheetFilters(EMPTY_SHEET_FILTERS)} className="text-sm font-medium text-accent hover:underline">
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sheetItems.map(r => (
                    <TeamLeavePersonRow
                      key={r.id}
                      request={r}
                      showName={false}
                      onSelect={x => { setSheetPerson(null); onSelectLeave(x) }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
