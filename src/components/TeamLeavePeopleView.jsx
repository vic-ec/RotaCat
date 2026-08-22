import { useMemo, useState } from 'react'
import Modal from './Modal'
import ProfileAvatar, { StatusBadge } from './ProfileAvatar'
import SectionLabel from './SectionLabel'
import TeamLeavePersonRow from './TeamLeavePersonRow'
import { buildPeopleLeave } from '../lib/teamLeaveMobile'
import { todayStr, formatShortDateRange } from '../lib/dateRange'
import { columnForLeaveCategory, LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'

const CATEGORY_GROUPS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

function fullName(doctor) {
  return `${doctor.name || ''} ${doctor.surname || ''}`.trim() || doctor.surname || 'Unknown'
}

function groupKeyForDoctor(doctor) {
  return columnForLeaveCategory(doctor.category, doctor.contract_type) ?? LEAVE_OTHER_COLUMN.key
}

function PersonRow({ person, onOpen }) {
  const { doctor, current, next } = person
  const rightLabel = current
    ? `On leave · ${formatShortDateRange(current.date_from, current.date_to)}`
    : next
      ? `Next · ${formatShortDateRange(next.date_from, next.date_to)}`
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
// of all their leave; tapping one of those opens its full detail.
export default function TeamLeavePeopleView({ requests, onSelectLeave }) {
  const [sheetPerson, setSheetPerson] = useState(null)
  const today = todayStr()
  const people = useMemo(() => buildPeopleLeave(requests, today), [requests, today])

  const groups = CATEGORY_GROUPS
    .map(g => ({ key: g.key, label: g.label, items: people.filter(p => groupKeyForDoctor(p.doctor) === g.key) }))
    .filter(g => g.items.length > 0)

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
                  <PersonRow key={person.doctor.id} person={person} onOpen={() => setSheetPerson(person)} />
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
            <div className="space-y-1.5">
              {sheetPerson.items.map(r => (
                <TeamLeavePersonRow
                  key={r.id}
                  request={r}
                  showName={false}
                  onSelect={x => { setSheetPerson(null); onSelectLeave(x) }}
                />
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
