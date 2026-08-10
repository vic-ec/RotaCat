import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, addMonths } from '../lib/dateRange'
import {
  fetchAllInternRotations, createInternRotation, updateInternRotation, deleteInternRotation,
} from '../lib/internRotations'
import { ListFilter, X, Table2, LayoutGrid, ChevronLeft, ChevronRight, EllipsisVertical, CircleQuestionMark, ScrollText } from 'lucide-react'
import DoctorDropdown from './DoctorDropdown'
import SelectMenu from './SelectMenu'
import CompactToolbarRow from './CompactToolbarRow'
import ViewToggle from './ViewToggle'
import PageActionsMenu from './PageActionsMenu'
import InternRotationsMatrix from './InternRotationsMatrix'
import { OT_SUBTYPE_OPTIONS, rotationTypeOptionsForCategory } from '../lib/staffDefaults'
import { buildDoctorDisplayNames } from '../lib/doctorNames'

const VIEW_OPTIONS = [
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'matrix', label: 'Matrix', icon: LayoutGrid },
]

const ROTATION_TYPE_OPTIONS = [
  { value: 'EC', label: 'EC' },
  { value: 'OT', label: 'OT' },
]
const ROTATION_TYPE_FILTER_OPTIONS = [{ value: 'all', label: 'All rotations' }, ...ROTATION_TYPE_OPTIONS]

// Table view uses two separate dropdowns (rotation_type, then subtype)
// rather than the Matrix's one combined "OT · LRCHC" picker, so this just
// narrows the flat EC/OT list down to whichever rotation_types
// rotationTypeOptionsForCategory (the single source of truth for "is this
// doctor Registrar-restricted to EC-only") allows for this doctor.
function tableRotationTypeOptions(category) {
  const allowedTypes = new Set(rotationTypeOptionsForCategory(category).map(o => o.rotationType))
  return ROTATION_TYPE_OPTIONS.filter(o => allowedTypes.has(o.value))
}

// Admin-only rotation-block management for COSMO/Intern/Registrar doctors
// — two views over the same intern_rotations table: an editable Table
// (bulk raw add/edit/delete, one row per block) and a Matrix (rows =
// doctors grouped by category, columns = a navigable year, colour-coded
// by rotation_type+subtype — see InternRotationsMatrix.jsx). Both always
// read live (no caching), since rotation blocks are meant to be freely
// editable, including last-minute swaps, and every capacity-counting call
// site elsewhere in the app depends on seeing that edit immediately.
export default function InternRotationsPlanner() {
  const { profile } = useAuth()
  const [view, setView] = useState('table')
  const [interns, setInterns] = useState([])
  const [rotations, setRotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [openDoctorPickerFor, setOpenDoctorPickerFor] = useState(null) // rotation id, or 'new'
  const [doctorSearch, setDoctorSearch] = useState('')
  const [newRow, setNewRow] = useState(null) // draft row before it's created
  // Table view only — search/filter over the rotation-block rows.
  const [tableSearch, setTableSearch] = useState('')
  const [rotationTypeFilter, setRotationTypeFilter] = useState('all')
  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  // Matrix view only — which year is showing, and which doctor (if any)
  // the sticky side panel is focused on. Lifted up here (rather than
  // owned inside InternRotationsMatrix) so a future "jump to this doctor
  // in the Matrix" action elsewhere on this page can drive both at once.
  const [matrixYear, setMatrixYear] = useState(currentYear)
  const [matrixSelectedDoctorId, setMatrixSelectedDoctorId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const [profilesRes, rotationsData] = await Promise.all([
      // COSMO/Intern/Registrar -- the OT/72h band (and its LRCHC/DPM-BCH/
      // Psych subtypes) is shared between COSMO and Intern, and real
      // rotation rows already exist for COSMO doctors; Registrars share
      // this same rotation timeline but are always EC-only (see
      // rotationTypeOptionsForCategory).
      supabase.from('profiles').select('id, name, surname, color_code, category').in('category', ['COSMO', 'Intern', 'Registrar']),
      fetchAllInternRotations().catch(err => { setError(err.message); return [] }),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    setInterns(profilesRes.data || [])
    setRotations(rotationsData)
    setLoading(false)
  }

  const internById = new Map(interns.map(i => [i.id, i]))
  // Disambiguates the Matrix's row labels/chips and the assign-doctor
  // dropdown below (same-surname collisions across COSMO/Intern/Registrar alike).
  const displayNames = buildDoctorDisplayNames(interns)

  const filteredRotations = rotations.filter(rotation => {
    if (rotationTypeFilter !== 'all' && rotation.rotation_type !== rotationTypeFilter) return false
    const q = tableSearch.trim().toLowerCase()
    if (q) {
      const intern = internById.get(rotation.doctor_id)
      const fullName = `${intern?.surname || ''} ${intern?.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    return true
  })
  const tableFiltersActive = Boolean(tableSearch) || rotationTypeFilter !== 'all'

  async function handleAddRow() {
    if (!newRow?.doctorId || !newRow?.startDate) return
    if (newRow.endDate && newRow.startDate > newRow.endDate) { setError('Start date must be on or before the end date.'); return }
    setSavingId('new')
    setError('')
    try {
      await createInternRotation({
        doctorId: newRow.doctorId, rotationType: newRow.rotationType, subtype: newRow.subtype,
        startDate: newRow.startDate, endDate: newRow.endDate || null,
        createdBy: profile?.id,
      })
      setNewRow(null)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSavingId(null)
  }

  async function handleUpdateRow(rotation, patch) {
    const next = {
      doctorId: rotation.doctor_id, rotationType: rotation.rotation_type, subtype: rotation.subtype,
      startDate: rotation.start_date, endDate: rotation.end_date, ...patch,
    }
    if (next.endDate && next.startDate > next.endDate) { setError('Start date must be on or before the end date.'); return }
    setSavingId(rotation.id)
    setError('')
    try {
      await updateInternRotation(rotation.id, next)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSavingId(null)
  }

  async function handleDeleteRow(rotation) {
    setSavingId(rotation.id)
    setError('')
    try {
      await deleteInternRotation(rotation.id, rotation.doctor_id)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSavingId(null)
  }

  // Matrix-only mutation wrappers — unlike handleUpdateRow/handleAddRow/
  // handleDeleteRow above (which catch errors into this page's own banner
  // `error` state, for Table view), these let errors propagate so
  // InternRotationsMatrix's side panel can show them inline next to the
  // block being edited instead.
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

  // Matrix view's "•••" overflow menu — How it works / Review log are both
  // inert stubs this pass (no audit-trail table exists yet for Review
  // log, and How it works has no content built yet either) — present so
  // the affordance reads as "coming soon", not silently missing.
  const matrixMenuItems = [
    { key: 'how-it-works', icon: <CircleQuestionMark className="h-4 w-4" />, label: 'How it works', disabled: true, onClick: () => {} },
    { key: 'review-log', icon: <ScrollText className="h-4 w-4" />, label: 'Review log', disabled: true, onClick: () => {} },
  ]

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">Intern rotations</h2>

      {error && <p className="mt-3 text-sm text-flagRed">{error}</p>}
      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {/* Search+Filter+view-toggle stay on one row across both views (not
          scoped to view === 'table') so the Table/Matrix toggle — needed
          to switch back out of Matrix — is always reachable. Matrix view
          additionally gets year nav + Today + the "•••" overflow menu,
          folded into the same trailing slot after the view toggle. */}
      {!loading && (() => {
        const filterFacet = {
          icon: <ListFilter className="h-4 w-4" />, label: 'Filter',
          value: rotationTypeFilter, onChange: setRotationTypeFilter,
          options: ROTATION_TYPE_FILTER_OPTIONS,
          isActive: rotationTypeFilter !== 'all',
        }
        const onClearAll = () => { setTableSearch(''); setRotationTypeFilter('all') }
        const toggle = (
          <div className="flex items-center gap-2">
            {view === 'matrix' && (
              <>
                <button
                  type="button"
                  onClick={() => setMatrixYear(y => y - 1)}
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-slate-line text-ink-light hover:bg-canvas-sunken"
                  aria-label="Previous year"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-ink">{matrixYear}</span>
                <button
                  type="button"
                  onClick={() => setMatrixYear(y => y + 1)}
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-slate-line text-ink-light hover:bg-canvas-sunken"
                  aria-label="Next year"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setMatrixYear(currentYear)} className="btn-secondary h-[30px] px-2 text-xs">
                  Today
                </button>
                <PageActionsMenu
                  title="Intern rotations"
                  items={matrixMenuItems}
                  trigger={onClick => (
                    <button
                      type="button"
                      onClick={onClick}
                      aria-label="More actions"
                      className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded text-ink-light hover:bg-canvas-sunken"
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </button>
                  )}
                />
              </>
            )}
            <ViewToggle view={view} onChange={setView} options={VIEW_OPTIONS} />
          </div>
        )
        return (
          <div className="mt-4">
            <CompactToolbarRow
              className="mb-4"
              searchValue={tableSearch}
              onSearchChange={setTableSearch}
              searchPlaceholder="Search by doctor surname or first name…"
              filterFacet={filterFacet}
              trailing={toggle}
              clearActive={tableFiltersActive}
              onClearAll={onClearAll}
            />
            <CompactToolbarRow
              desktop
              className="mb-4"
              searchValue={tableSearch}
              onSearchChange={setTableSearch}
              searchPlaceholder="Search by doctor surname or first name…"
              filterFacet={filterFacet}
              trailing={toggle}
              clearActive={tableFiltersActive}
              onClearAll={onClearAll}
            />
          </div>
        )
      })()}

      {!loading && view === 'table' && (
        <div>
          <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-line text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-medium">Doctor</th>
                <th className="px-3 py-2 font-medium">Rotation</th>
                <th className="px-3 py-2 font-medium">OT subtype</th>
                <th className="px-3 py-2 font-medium">Start date</th>
                <th className="px-3 py-2 font-medium">End date</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-line">
              {rotations.length === 0 && !newRow && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-ink-muted">No rotation blocks yet.</td></tr>
              )}
              {rotations.length > 0 && filteredRotations.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-ink-muted">No rotation blocks match this filter/search.</td></tr>
              )}
              {filteredRotations.map(rotation => {
                const intern = internById.get(rotation.doctor_id)
                const rowSaving = savingId === rotation.id
                return (
                  <tr key={rotation.id}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => { setDoctorSearch(''); setOpenDoctorPickerFor(rotation.id) }}
                        className="text-left font-medium text-ink hover:text-accent"
                      >
                        {intern ? `${intern.surname}, ${intern.name}` : 'Unknown doctor'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <SelectMenu
                        value={rotation.rotation_type}
                        onChange={v => handleUpdateRow(rotation, { rotationType: v, subtype: v === 'OT' ? rotation.subtype : null })}
                        options={tableRotationTypeOptions(intern?.category)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {rotation.rotation_type === 'OT' ? (
                        <SelectMenu
                          value={rotation.subtype || ''}
                          onChange={v => handleUpdateRow(rotation, { subtype: v })}
                          placeholder="Not yet assigned…"
                          options={OT_SUBTYPE_OPTIONS}
                        />
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={rotation.start_date}
                        onChange={e => handleUpdateRow(rotation, { startDate: e.target.value })}
                        className="input-field max-w-[130px]"
                        disabled={rowSaving}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={rotation.end_date || ''}
                        onChange={e => handleUpdateRow(rotation, { endDate: e.target.value || null })}
                        className="input-field max-w-[130px]"
                        disabled={rowSaving}
                        placeholder="Ongoing"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(rotation)}
                        disabled={rowSaving}
                        title="Remove"
                        aria-label="Remove"
                        className="flex h-7 w-7 items-center justify-center rounded text-flagRed transition-colors hover:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}

              {newRow && (
                <tr>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => { setDoctorSearch(''); setOpenDoctorPickerFor('new') }}
                      className="text-left font-medium text-ink hover:text-accent"
                    >
                      {newRow.doctorId ? `${internById.get(newRow.doctorId)?.surname}, ${internById.get(newRow.doctorId)?.name}` : 'Pick a doctor…'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <SelectMenu
                      value={newRow.rotationType}
                      onChange={v => setNewRow(r => ({ ...r, rotationType: v, subtype: v === 'OT' ? r.subtype : null }))}
                      options={tableRotationTypeOptions(internById.get(newRow.doctorId)?.category)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {newRow.rotationType === 'OT' ? (
                      <SelectMenu
                        value={newRow.subtype || ''}
                        onChange={v => setNewRow(r => ({ ...r, subtype: v }))}
                        placeholder="Not yet assigned…"
                        options={OT_SUBTYPE_OPTIONS}
                      />
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={newRow.startDate}
                      onChange={e => setNewRow(r => ({ ...r, startDate: e.target.value }))}
                      className="input-field max-w-[130px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={newRow.endDate || ''}
                      onChange={e => setNewRow(r => ({ ...r, endDate: e.target.value || null }))}
                      className="input-field max-w-[130px]"
                      placeholder="Ongoing"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={handleAddRow}
                      disabled={savingId === 'new' || !newRow.doctorId || !newRow.startDate}
                      className="btn-primary px-2 py-1 text-xs disabled:opacity-50"
                    >
                      {savingId === 'new' ? 'Saving…' : 'Add'}
                    </button>
                    <button type="button" onClick={() => setNewRow(null)} className="ml-2 text-xs text-ink-muted hover:text-ink">
                      Cancel
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!newRow && (
            <div className="border-t border-slate-line p-2">
              <button
                type="button"
                onClick={() => setNewRow({ doctorId: null, rotationType: 'EC', subtype: null, startDate: today, endDate: null })}
                className="btn-secondary text-xs"
              >
                + Add rotation block
              </button>
            </div>
          )}
          </div>
        </div>
      )}

      {!loading && view === 'matrix' && (
        <InternRotationsMatrix
          doctors={interns}
          rotations={rotations}
          displayNames={displayNames}
          currentUserId={profile?.id}
          year={matrixYear}
          selectedDoctorId={matrixSelectedDoctorId}
          onSelectDoctor={setMatrixSelectedDoctorId}
          onUpdateRotation={updateRotationRaw}
          onCreateRotation={createRotationRaw}
          onDeleteRotation={deleteRotationRaw}
        />
      )}

      {openDoctorPickerFor && (
        <DoctorDropdown
          profiles={interns}
          displayNames={displayNames}
          search={doctorSearch}
          onSearchChange={setDoctorSearch}
          onSelect={doctorId => {
            if (openDoctorPickerFor === 'new') {
              setNewRow(r => {
                // Registrar EC rotations are consistently 3-month blocks —
                // default the End date to save the common case a click,
                // still fully editable afterward. Only applies at the
                // moment a doctor is first picked for a brand-new row.
                const isRegistrar = internById.get(doctorId)?.category === 'Registrar'
                return {
                  ...r, doctorId,
                  rotationType: isRegistrar ? 'EC' : r.rotationType,
                  subtype: isRegistrar ? null : r.subtype,
                  endDate: isRegistrar ? addMonths(r.startDate, 3) : r.endDate,
                }
              })
            }
            else {
              const rotation = rotations.find(r => r.id === openDoctorPickerFor)
              if (rotation) handleUpdateRow(rotation, { doctorId })
            }
            setOpenDoctorPickerFor(null)
          }}
          onClose={() => setOpenDoctorPickerFor(null)}
          date={openDoctorPickerFor === 'new' ? (newRow?.startDate || today) : (rotations.find(r => r.id === openDoctorPickerFor)?.start_date || today)}
          shiftCode="Intern rotation"
        />
      )}
    </div>
  )
}
