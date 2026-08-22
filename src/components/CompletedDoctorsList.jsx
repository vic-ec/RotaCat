import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { todayStr } from '../lib/dateRange'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'

// Completed tab of the Rotations page — Intern/Registrar/COSMO doctors
// who are inactive with no start already scheduled (as opposed to the
// Upcoming tab's inactive-but-scheduled doctors). "Reactivate" defaults
// to today: a today-or-earlier date reactivates immediately (the caller
// then drops the admin into the Matrix's doctor-edit panel to add their
// next block — see InternRotationsPlanner's onReactivate/focusDoctorId),
// a future date just schedules it the same way Upcoming's own dates do,
// which moves this doctor over to that tab on the next load.
export default function CompletedDoctorsList({ doctors, displayNames, onReactivate }) {
  const navigate = useNavigate()
  const [reactivatingId, setReactivatingId] = useState(null)
  const [draftDate, setDraftDate] = useState(todayStr())
  const [savingId, setSavingId] = useState(null)
  const [errorId, setErrorId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Mobile row-tap detail panel — matches the Staff list page's own
  // row-tap sheet (StaffListPage.jsx's detailSheetPerson) so this tab's
  // rows behave the same way as every other tappable person-row in the
  // app instead of only exposing Reactivate inline.
  const [detailPerson, setDetailPerson] = useState(null)
  const detailSheetRef = useRef(null)
  useDismissablePopover(!!detailPerson, () => setDetailPerson(null), detailSheetRef)
  const detailSwipe = useSwipeToDismiss(() => setDetailPerson(null))

  // Sorted by surname, independent of whatever displayNames renders below
  // (now a full "First Surname" label) — keeps this list's ordering stable
  // rather than silently switching to first-name order.
  const sorted = [...doctors].sort((a, b) => (a.surname || '').localeCompare(b.surname || ''))

  if (sorted.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">No completed doctors.</p>
  }

  function startReactivating(doctor) {
    setReactivatingId(doctor.id)
    setDraftDate(todayStr())
    setErrorId(null)
  }

  async function confirmReactivate(doctorId) {
    setSavingId(doctorId)
    setErrorId(null)
    try {
      await onReactivate(doctorId, draftDate)
      setReactivatingId(null)
    } catch (err) {
      setErrorId(doctorId)
      setErrorMessage(err.message)
    }
    setSavingId(null)
  }

  return (
    <>
    <div className="mt-4 divide-y divide-slate-line">
      {sorted.map(doctor => {
        const isReactivating = reactivatingId === doctor.id
        const rowSaving = savingId === doctor.id
        return (
          <div key={doctor.id} onClick={() => setDetailPerson(doctor)} className="cursor-pointer py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: doctor.color_code }} />
                <span className="font-medium text-ink">{displayNames?.get(doctor.id) ?? doctor.surname}</span>
                <span className="text-xs text-ink-muted capitalize">{doctor.category}</span>
                {/* Same classes as the Staff list's own Inactive pill
                    (StaffListPage.jsx) for a matching height/width, plus
                    leading-none: without it this row's own text-sm
                    (a couple of levels up) sets an absolute line-height
                    (1.25rem) that cascades down and inflates the pill well
                    past its 9px font-size — Staff list's row never opts
                    into text-sm in the first place, so it doesn't need the
                    override to render at the same height. */}
                <span className="flex items-center whitespace-nowrap rounded-md border border-flagRed/40 px-1.5 py-1 text-[9px] font-semibold uppercase leading-none tracking-wide text-flagRed">
                  Inactive
                </span>
              </div>
              {!isReactivating && (
                <button type="button" onClick={e => { e.stopPropagation(); startReactivating(doctor) }} className="btn-secondary px-2 py-1 text-xs">
                  Reactivate
                </button>
              )}
            </div>
            {isReactivating && (
              <div onClick={e => e.stopPropagation()} className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  Active from
                  <input
                    type="date"
                    value={draftDate}
                    onChange={e => setDraftDate(e.target.value)}
                    className="input-field py-1 text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => confirmReactivate(doctor.id)}
                  disabled={rowSaving || !draftDate}
                  className="btn-primary px-2 py-1 text-xs disabled:opacity-50"
                >
                  {rowSaving ? 'Saving…' : draftDate <= todayStr() ? 'Activate now' : 'Schedule'}
                </button>
                <button type="button" onClick={() => setReactivatingId(null)} disabled={rowSaving} className="text-xs text-ink-muted hover:text-ink">
                  Cancel
                </button>
              </div>
            )}
            {errorId === doctor.id && <p className="mt-1 text-xs text-flagRed">{errorMessage}</p>}
          </div>
        )
      })}
    </div>

    {/* ── Mobile row-tap detail sheet — matches StaffListPage's own
         detailSheetPerson so this tab's rows are tappable the same way as
         every other person-row in the app, with View Account and
         Reactivate as the sheet's own one-tap actions. ── */}
    {detailPerson && (
      <div
        ref={detailSheetRef}
        role="dialog"
        aria-modal="true"
        style={detailSwipe.style}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-slate-line bg-canvas-raised px-5 pb-6 pt-3 shadow-[0_-3px_10px_0_rgba(15,23,42,0.18)] md:hidden"
      >
        <div {...detailSwipe.handleProps} className="touch-none">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-line" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">
                {detailPerson.name ? `${detailPerson.name} ` : ''}{detailPerson.surname}
              </p>
              <p className="text-sm capitalize text-ink-muted">{detailPerson.category}</p>
            </div>
            <span className="flex-shrink-0 text-sm font-medium text-flagRed">Inactive</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => { setDetailPerson(null); navigate(`/account/${detailPerson.id}`) }}
            className="btn-secondary h-11 flex-1 text-sm"
          >
            View Account
          </button>
          <button
            type="button"
            onClick={() => { const person = detailPerson; setDetailPerson(null); startReactivating(person) }}
            className="btn-primary h-11 flex-1 text-sm"
          >
            Reactivate
          </button>
        </div>
      </div>
    )}
    </>
  )
}
