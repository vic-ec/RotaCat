import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { fetchAllInternRotations, createInternRotation, updateInternRotation, deleteInternRotation } from '../lib/internRotations'
import InternRotationsMatrix from './InternRotationsMatrix'
import EndOfRotationQueue from './EndOfRotationQueue'
import { buildDoctorDisplayNames } from '../lib/doctorNames'

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
  const [interns, setInterns] = useState([])
  const [rotations, setRotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  // Which year the Matrix is showing, and which doctor (if any) its side
  // panel is focused on. Lifted up here (rather than owned inside
  // InternRotationsMatrix) so other actions on this page — the
  // end-of-rotation queue's "View in Matrix", or a future reactivation
  // flow — can drive both at once.
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
      // one already set is excluded from it.
      supabase.from('profiles').select('id, name, surname, color_code, category, scheduled_inactive_date').in('category', ['COSMO', 'Intern', 'Registrar']),
      fetchAllInternRotations().catch(err => { setError(err.message); return [] }),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    setInterns(profilesRes.data || [])
    setRotations(rotationsData)
    setLoading(false)
  }

  // Disambiguates the Matrix's row labels/chips and its add-doctor
  // dropdown (same-surname collisions across COSMO/Intern/Registrar alike).
  const displayNames = buildDoctorDisplayNames(interns)

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

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">Intern rotations</h2>

      {error && <p className="mt-3 text-sm text-flagRed">{error}</p>}
      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {!loading && (
        <div className="mt-3">
          <EndOfRotationQueue
            doctors={interns}
            rotations={rotations}
            displayNames={displayNames}
            onScheduleDeactivation={scheduleDeactivation}
            onViewInMatrix={setSelectedDoctorId}
          />
        </div>
      )}

      {!loading && (
        <div className="mt-4">
          <InternRotationsMatrix
            doctors={interns}
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
      )}
    </div>
  )
}
