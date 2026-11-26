import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock } from 'lucide-react'
import { fetchOnShiftBoard, startsInLabel } from '../lib/onShiftBoard'
import { shiftStartLabel } from '../lib/myYear'
import { formatLocalDate } from '../lib/dateRange'
import ProfileAvatar from './ProfileAvatar'
import ContactSheet from './ContactSheet'
import { PanelRows, PanelRow } from './PanelRows'

// The admin Dashboard's "On shift": who is on now (grouped by shift, each
// with its end time) and who starts next. One row per shift (PanelRows, as
// Team leave and Sick leave): the shift, then its people in two columns
// with avatar, full name and category — the same at every width, so the
// three panels read alike. A small clock marks a late arrival logged for
// that shift.

function Face({ person, size }) {
  if (person.kind === 'doctor') return <ProfileAvatar profile={person.profile} size={size} />
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed font-bold ${size < 36 ? 'text-[10px]' : 'text-xs'} ${
        person.kind === 'open' ? 'border-flagRed bg-canvas-raised text-flagRed' : 'border-flagAmber bg-flagAmber-bg text-flagAmber'
      }`}
      style={{ width: size, height: size }}
    >
      {person.initials}
    </span>
  )
}

function LateClock() {
  return (
    <span data-testid="on-shift-late" className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-line bg-canvas-raised">
      <AlarmClock className="h-3 w-3 text-ink" aria-hidden="true" />
    </span>
  )
}

// One line per person. Someone with contact details on record (a doctor,
// or a locum with an account or a contact record) is a button that opens
// their contact card; an open slot is not.
function PersonLine({ person, onContact }) {
  const label = `${person.label}${person.late ? ' · late arrival logged' : ''}`
  const contactable = Boolean(onContact && (person.profileId || person.contactId))
  const body = (
    <>
      <span className="relative flex-shrink-0">
        <Face person={person} size={32} />
        {person.late && <LateClock />}
      </span>
      <span className="min-w-0">
        <span className={`block truncate whitespace-nowrap text-sm font-semibold ${person.kind === 'open' ? 'text-flagRed' : 'text-ink'}`}>{person.name}</span>
        <span className="block truncate whitespace-nowrap text-xs text-ink-muted">{person.meta}</span>
      </span>
    </>
  )
  return (
    <li className="min-w-0">
      {contactable ? (
        <button
          type="button"
          onClick={() => onContact({ profileId: person.profileId, contactId: person.contactId, name: person.name, meta: person.meta })}
          aria-label={`${label}. Contact details`}
          className="-m-1 flex w-[calc(100%+0.5rem)] min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 items-center gap-2.5" aria-label={label}>{body}</span>
      )}
    </li>
  )
}

// The left-hand side of a desktop shift row.
function ShiftLabel({ group, tag }) {
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{tag}</p>
      <span className={`${group.night ? 'chip-night' : 'chip-mint'} mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold`}>
        {shiftStartLabel(group.startTime)}–{shiftStartLabel(group.endTime)}
      </span>
    </>
  )
}

// Today's row on the roster that holds today's shifts; the Roster page
// when there's none.
function rosterLink(board, now) {
  if (!board?.rosterMonthId) return '/roster'
  return `/roster/${board.rosterMonthId}?date=${formatLocalDate(now)}`
}

export default function OnShiftPanel() {
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  // The contact card open from a name: { profileId | contactId, name, meta }.
  const [contact, setContact] = useState(null)

  useEffect(() => {
    let cancelled = false
    const read = () => {
      const at = new Date()
      fetchOnShiftBoard(at)
        .then(b => { if (!cancelled) { setBoard(b); setNow(at); setError('') } })
        .catch(err => { if (!cancelled) setError(err.message) })
    }
    read()
    // Shifts change on the hour or so; a quiet re-read every few minutes
    // keeps a Dashboard left open from going stale.
    const timer = setInterval(read, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])


  return (
    <section data-testid="on-shift-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">On shift</h2>
        <Link to={rosterLink(board, now)} className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark">View roster ›</Link>
      </div>
      <div className="card overflow-visible">
        {error ? (
          <p className="p-4 text-sm text-ink-muted">Could not load who is on shift.</p>
        ) : !board ? (
          <p className="p-4 text-sm text-ink-muted">Loading…</p>
        ) : board.now.length === 0 && board.next.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Nobody on shift on a published roster.</p>
        ) : (
          <PanelRows>
            {board.now.length === 0 && (
              <PanelRow label={<p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Now</p>} empty="Nobody on shift right now." />
            )}
            {board.now.map(g => (
              <PanelRow key={g.key} testId="on-shift-group" label={<ShiftLabel group={g} tag="Now" />}>
                {g.people.map(p => <PersonLine key={p.key} person={p} onContact={setContact} />)}
              </PanelRow>
            ))}
            {board.next.map(g => (
              <PanelRow key={g.key} testId="on-shift-group" tint label={<ShiftLabel group={g} tag={`Next · ${startsInLabel(g.start, now)}`} />}>
                {g.people.map(p => <PersonLine key={p.key} person={p} onContact={setContact} />)}
              </PanelRow>
            ))}
          </PanelRows>
        )}
        {board?.consultant && (
          <p className="border-t border-slate-line px-4 py-2.5 text-xs text-ink-muted" data-testid="on-call">
            On call Consultant:{' '}
            {board.consultantId ? (
              <button
                type="button"
                onClick={() => setContact({ profileId: board.consultantId, name: board.consultant, meta: 'Consultant on call' })}
                aria-label={`${board.consultant}, consultant on call. Contact details`}
                className="font-semibold text-ink underline decoration-slate-line underline-offset-2 hover:text-accent hover:decoration-accent"
              >
                {board.consultant}
              </button>
            ) : (
              <span className="font-semibold text-ink">{board.consultant}</span>
            )}
          </p>
        )}
      </div>
      {contact && <ContactSheet target={contact} onClose={() => setContact(null)} />}
    </section>
  )
}
