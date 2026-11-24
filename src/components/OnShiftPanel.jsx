import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock } from 'lucide-react'
import { fetchOnShiftBoard, startsInLabel } from '../lib/onShiftBoard'
import { shiftStartLabel } from '../lib/myYear'
import ProfileAvatar from './ProfileAvatar'

// The admin Dashboard's "On shift": one row per shift — who is on now
// (until when), then who starts next (and when). Initials only, in each
// person's avatar; the full name and category show on hover and on tap.
// A small clock marks a late arrival logged for that shift.
const BADGE = 40

function Badge({ person, open, onToggle }) {
  const tipShown = open ? 'block' : 'hidden group-hover:block group-focus-visible:block'
  let face
  if (person.kind === 'doctor') {
    face = <ProfileAvatar profile={person.profile} size={BADGE} />
  } else {
    face = (
      <span
        className={`flex items-center justify-center rounded-full border-[1.5px] border-dashed text-xs font-bold ${
          person.kind === 'open' ? 'border-flagRed bg-canvas-raised text-flagRed' : 'border-flagAmber bg-flagAmber-bg text-flagAmber'
        }`}
        style={{ width: BADGE, height: BADGE }}
      >
        {person.initials}
      </span>
    )
  }
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
        {person.late && (
          <span data-testid="on-shift-late" className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-line bg-canvas-raised">
            <AlarmClock className="h-3 w-3 text-ink" aria-hidden="true" />
          </span>
        )}
        <span role="tooltip" className={`pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-canvas ${tipShown}`}>
          {person.label}
        </span>
      </button>
    </li>
  )
}

function ShiftRow({ group, tag, when, next = false, openKey, setOpenKey }) {
  return (
    <li className={`grid gap-3 px-4 py-3.5 md:grid-cols-[210px_minmax(0,1fr)] md:items-center md:gap-4 ${next ? 'bg-canvas-cool' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:block">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted md:mb-1">{tag}</p>
        <span className={`${group.night ? 'chip-night' : 'chip-mint'} inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold`}>
          {shiftStartLabel(group.startTime)}–{shiftStartLabel(group.endTime)}
        </span>
        <p className="text-xs text-ink-muted md:mt-1">{when}</p>
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

  const until = g => <>On shift until <b className="text-sm text-ink">{shiftStartLabel(g.endTime)}</b></>
  const onAt = g => <>On at <b className="text-sm text-ink">{shiftStartLabel(g.startTime)}</b></>

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
        ) : (
          <ul className="divide-y divide-slate-line">
            {board.now.length === 0 && <li className="p-4 text-sm text-ink-muted">Nobody on shift right now.</li>}
            {board.now.map(g => <ShiftRow key={g.key} group={g} tag="Now" when={until(g)} openKey={openKey} setOpenKey={setOpenKey} />)}
            {board.next.map(g => (
              <ShiftRow key={g.key} group={g} tag={`Next · ${startsInLabel(g.start, now)}`} when={onAt(g)} next openKey={openKey} setOpenKey={setOpenKey} />
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
