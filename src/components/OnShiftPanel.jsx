import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock } from 'lucide-react'
import { fetchOnShiftBoard, startsInLabel } from '../lib/onShiftBoard'
import { shiftStartLabel } from '../lib/myYear'
import ProfileAvatar from './ProfileAvatar'
import { useIsDesktop } from '../lib/useIsDesktop'
import { PanelRows, PanelRow } from './PanelRows'

// The admin Dashboard's "On shift": who is on now (grouped by shift, each
// with its end time) and who starts next.
//   desktop (md+)  one row per shift (PanelRows, as Team leave and Sick
//                  leave): the shift on the left, its people side by side
//                  with avatar, full name and category
//   phone          one row per shift with initials badges; the full name and
//                  category show on tap
// A small clock marks a late arrival logged for that shift.
const BADGE = 40

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

// Desktop: one line per person.
function PersonLine({ person }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5" aria-label={`${person.label}${person.late ? ' · late arrival logged' : ''}`}>
      <span className="relative flex-shrink-0">
        <Face person={person} size={32} />
        {person.late && <LateClock />}
      </span>
      <span className="min-w-0">
        <span className={`block truncate whitespace-nowrap text-sm font-semibold ${person.kind === 'open' ? 'text-flagRed' : 'text-ink'}`}>{person.name}</span>
        <span className="block truncate whitespace-nowrap text-xs text-ink-muted">{person.meta}</span>
      </span>
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

// Phone: an initials badge; tap for the name.
function Badge({ person, open, onToggle }) {
  const tipShown = open ? 'block' : 'hidden group-hover:block group-focus-visible:block'
  const face = <Face person={person} size={BADGE} />
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onToggle}
        onBlur={() => open && onToggle()}
        aria-label={`${person.label}${person.late ? ' · late arrival logged' : ''}`}
        aria-expanded={open}
        className="group relative block rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {face}
        {person.late && <LateClock />}
        <span role="tooltip" className={`pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-canvas ${tipShown}`}>
          {person.label}
        </span>
      </button>
    </li>
  )
}

function ShiftRow({ group, tag, next = false, openKey, setOpenKey }) {
  return (
    <li className={`grid gap-3 px-4 py-3.5 md:grid-cols-[210px_minmax(0,1fr)] md:items-center md:gap-4 ${next ? 'bg-canvas-cool' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted md:mb-1">{tag}</p>
        <span className={`${group.night ? 'chip-night' : 'chip-mint'} inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold`}>
          {shiftStartLabel(group.startTime)}–{shiftStartLabel(group.endTime)}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {group.people.map(p => (
          <Badge key={p.key} person={p} open={openKey === p.key} onToggle={() => setOpenKey(k => (k === p.key ? null : p.key))} />
        ))}
      </ul>
    </li>
  )
}

export default function OnShiftPanel() {
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const isDesktop = useIsDesktop(768)

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
        <Link to="/roster" className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark">View roster ›</Link>
      </div>
      <div className="card overflow-visible">
        {error ? (
          <p className="p-4 text-sm text-ink-muted">Could not load who is on shift.</p>
        ) : !board ? (
          <p className="p-4 text-sm text-ink-muted">Loading…</p>
        ) : board.now.length === 0 && board.next.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Nobody on shift on a published roster.</p>
        ) : isDesktop ? (
          <PanelRows>
            {board.now.length === 0 && (
              <PanelRow label={<p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Now</p>} empty="Nobody on shift right now." />
            )}
            {board.now.map(g => (
              <PanelRow key={g.key} testId="on-shift-group" label={<ShiftLabel group={g} tag="Now" />}>
                {g.people.map(p => <PersonLine key={p.key} person={p} />)}
              </PanelRow>
            ))}
            {board.next.map(g => (
              <PanelRow key={g.key} testId="on-shift-group" tint label={<ShiftLabel group={g} tag={`Next · ${startsInLabel(g.start, now)}`} />}>
                {g.people.map(p => <PersonLine key={p.key} person={p} />)}
              </PanelRow>
            ))}
          </PanelRows>
        ) : (
          <ul className="divide-y divide-slate-line">
            {board.now.length === 0 && <li className="p-4 text-sm text-ink-muted">Nobody on shift right now.</li>}
            {board.now.map(g => <ShiftRow key={g.key} group={g} tag="Now" openKey={openKey} setOpenKey={setOpenKey} />)}
            {board.next.map(g => (
              <ShiftRow key={g.key} group={g} tag={`Next · ${startsInLabel(g.start, now)}`} next openKey={openKey} setOpenKey={setOpenKey} />
            ))}
          </ul>
        )}
        {board?.consultant && (
          <p className="flex items-center gap-2 border-t border-slate-line px-4 py-2.5 text-xs text-ink-muted">
            <span className="chip-mint rounded-full px-2 py-0.5 text-[11px] font-semibold">On call</span>
            Consultant: {board.consultant}
          </p>
        )}
      </div>
    </section>
  )
}
