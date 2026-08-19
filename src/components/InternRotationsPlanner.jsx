import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { fetchAllInternRotations, createInternRotation, updateInternRotation, deleteInternRotation } from '../lib/internRotations'
import InternRotationsMatrix from './InternRotationsMatrix'
import EndOfRotationQueue from './EndOfRotationQueue'
import UpcomingDoctorsList from './UpcomingDoctorsList'
import CompletedDoctorsList from './CompletedDoctorsList'
import PageTabs from './PageTabs'
import { buildDoctorFullNames } from '../lib/doctorNames'

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
]

// Admin-only rotation-block management for COSMO/Intern/Registrar doctors.
// Matrix is the only view (the old Table view's one remaining job, adding
// a new doctor, is covered by the Matrix's own "+ Add doctor" flow) — see
// InternRotationsMatrix.jsx for the row-per-doctor/column-per-month
// layout and its separate mobile card-strip layout. Always reads live (no
// caching), since rotation blocks are meant to be freely editable,
// including last-minute swaps, and every capacity-counting call site
// elsewhere in the app depends on seeing that edit immediately.
export default function InternRotationsPlanner() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState('active')
  const [interns, setInterns] = useState([])
  const [rotations, setRotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  // Which year the Matrix is showing, and which doctor (if any) its side
  // panel is focused on. Lifted up here (rather than owned inside
  // InternRotationsMatrix) so other actions on this page — the
  // end-of-rotation queue's "View in Matrix", or reactivating a doctor
  // from the Completed tab — can drive both at once.
  const [year, setYear] = useState(currentYear)
  const [selectedDoctorId, setSelectedDoctorId] = useState(null)
  // One-shot "jump to this doctor and start editing" trigger — consumed
  // immediately by InternRotationsMatrix, same shape as
  // AnnualLeavePlanner's deepLinkMonth/onDeepLinkConsumed pattern.
  const [focusDoctorId, setFocusDoctorId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const [profilesRes, rotationsData] = await Promise.all([
      // COSMO/Intern/Registrar -- the OT/72h band (and its LRCHC/DPM-BCH/
      // Psych subtypes) is shared between COSMO and Intern, and real
      // rotation rows already exist for COSMO doctors; Registrars share
      // this same rotation timeline but are always EC-only (see
      // rotationTypeOptionsForCategory). scheduled_inactive_date feeds the
      // end-of-rotation queue below (EndOfRotationQueue) — a doctor with
      // one already set is excluded from it. is_active/scheduled_active_date
      // split doctors across the Active/Upcoming/Completed tabs below.
      supabase.from('profiles')
        .select('id, name, surname, color_code, category, is_active, scheduled_inactive_date, scheduled_active_date')
        .in('category', ['COSMO', 'Intern', 'Registrar']),
      fetchAllInternRotations().catch(err => { setError(err.message); return [] }),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    setInterns(profilesRes.data || [])
    setRotations(rotationsData)
    setLoading(false)
  }

  // One-shot "open this doctor's card" deep link — the Staff account
  // page's "See rotations" row (AccountSettingsPage.jsx) lands here as
  // `?tab=planners&sub=interns&doctor=<id>`. Waits for `interns` to finish
  // its first load (can't know which tab a doctor belongs on before then),
  // then routes them to the matching tab and, for an active doctor, opens
  // their Matrix side panel the same way "View in Matrix" does — a plain
  // selection, not forced into edit mode. Silently does nothing for an id
  // that isn't found (deleted doctor, stale link, RLS). Stripped from the
  // URL once consumed so switching tabs and back doesn't reopen it.
  useEffect(() => {
    const doctorId = searchParams.get('doctor')
    if (!doctorId || loading) return
    const doctor = interns.find(d => d.id === doctorId)
    if (doctor) {
      if (doctor.is_active) { setTab('active'); setSelectedDoctorId(doctor.id) }
      else if (doctor.scheduled_active_date) setTab('upcoming')
      else setTab('completed')
    }
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('doctor')
      return next
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once interns finishes its first load, consuming whichever doctor id was in the URL at that point
  }, [loading, interns])

  // Active = the Matrix's own doctor pool, unchanged. Upcoming/Completed
  // split the rest by whether a future start is already scheduled (see
  // UpcomingDoctorsList/CompletedDoctorsList).
  const activeInterns = interns.filter(d => d.is_active)
  const upcomingInterns = interns.filter(d => !d.is_active && d.scheduled_active_date)
  const completedInterns = interns.filter(d => !d.is_active && !d.scheduled_active_date)

  // Full "First Surname" labels for the Matrix's row labels/chips, its
  // add-doctor dropdown, and the queue/Upcoming/Completed lists — this page
  // has the room for a full name rather than the surname(+initial)
  // shorthand buildDoctorDisplayNames uses elsewhere (weekend planner,
  // roster grid), so there's no same-surname ambiguity to resolve here.
  const displayNames = buildDoctorFullNames(interns)

  // Errors propagate (not caught into this page's own banner) so the
  // Matrix's side panel can show them inline next to the block being
  // edited instead.
  async function updateRotationRaw(rotation, patch) {
    const next = {
      doctorId: rotation.doctor_id, rotationType: rotation.rotation_type, subtype: rotation.subtype,
      startDate: rotation.start_date, endDate: rotation.end_date, ...patch,
    }
    await updateInternRotation(rotation.id, next)
    await load()
  }
  async function createRotationRaw(draft) {
    await createInternRotation(draft)
    await load()
  }
  async function deleteRotationRaw(rotation) {
    await deleteInternRotation(rotation.id, rotation.doctor_id)
    await load()
  }

  // End-of-rotation queue actions (EndOfRotationQueue below).
  async function scheduleDeactivation(doctorId, date) {
    const { error: updateError } = await supabase.from('profiles')
      .update({ scheduled_inactive_date: date })
      .eq('id', doctorId)
    if (updateError) throw new Error(updateError.message)
    await load()
  }

  // Upcoming tab actions (UpcomingDoctorsList below).
  async function updateScheduledActiveDate(doctorId, date) {
    const { error: updateError } = await supabase.from('profiles')
      .update({ scheduled_active_date: date })
      .eq('id', doctorId)
    if (updateError) throw new Error(updateError.message)
    await load()
  }
  async function activateNow(doctorId) {
    const { error: updateError } = await supabase.from('profiles')
      .update({ is_active: true, scheduled_active_date: null })
      .eq('id', doctorId)
    if (updateError) throw new Error(updateError.message)
    await load()
  }

  // Completed tab's Reactivate (CompletedDoctorsList below) — a
  // today-or-earlier date reactivates immediately and drops the admin
  // straight into the Matrix's doctor-edit panel to add the doctor's next
  // block (same focusDoctorId mechanism the end-of-rotation queue's "View
  // in Matrix" uses); a future date just schedules it, same as editing
  // the date on the Upcoming tab would.
  async function reactivate(doctorId, date) {
    if (date <= today) {
      await activateNow(doctorId)
      setTab('active')
      setFocusDoctorId(doctorId)
    } else {
      await updateScheduledActiveDate(doctorId, date)
    }
  }

  const tabsWithBadges = TABS.map(t => {
    if (t.key === 'upcoming') return { ...t, badge: upcomingInterns.length }
    if (t.key === 'completed') return { ...t, badge: completedInterns.length }
    return t
  })

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">Intern, COSMO, &amp; Registrar Rotations</h2>

      {error && <p className="mt-3 text-sm text-flagRed">{error}</p>}
      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {!loading && (
        <div className="mt-3">
          <PageTabs tabs={tabsWithBadges} active={tab} onChange={setTab} ariaLabel="Rotations" size="sub" />
        </div>
      )}

      {!loading && tab === 'active' && (
        <>
          <div className="mt-3">
            <EndOfRotationQueue
              doctors={activeInterns}
              rotations={rotations}
              displayNames={displayNames}
              onScheduleDeactivation={scheduleDeactivation}
              onViewInMatrix={setSelectedDoctorId}
            />
          </div>

          <div className="mt-4">
            <InternRotationsMatrix
              doctors={activeInterns}
              rotations={rotations}
              displayNames={displayNames}
              currentUserId={profile?.id}
              year={year}
              onYearChange={setYear}
              selectedDoctorId={selectedDoctorId}
              onSelectDoctor={setSelectedDoctorId}
              onUpdateRotation={updateRotationRaw}
              onCreateRotation={createRotationRaw}
              onDeleteRotation={deleteRotationRaw}
              focusDoctorId={focusDoctorId}
              onFocusDoctorConsumed={() => setFocusDoctorId(null)}
            />
          </div>
        </>
      )}

      {!loading && tab === 'upcoming' && (
        <UpcomingDoctorsList
          doctors={upcomingInterns}
          displayNames={displayNames}
          onUpdateDate={updateScheduledActiveDate}
          onActivateNow={activateNow}
        />
      )}

      {!loading && tab === 'completed' && (
        <CompletedDoctorsList
          doctors={completedInterns}
          displayNames={displayNames}
          onReactivate={reactivate}
        />
      )}
    </div>
  )
}
