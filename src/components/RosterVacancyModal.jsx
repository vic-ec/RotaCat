import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DoctorDropdown from './DoctorDropdown'
import { findSameDayConflict } from '../lib/rosterVacancy'
import { logRosterEntryChange } from '../lib/changeLog'

function applyEntryPatch(entries, entryId, patch) {
  return entries.map(e => (e.id === entryId ? { ...e, ...patch } : e))
}

const VACATE_PATCH = {
  profile_id: null,
  is_locum: false,
  locum_name: null,
  is_manual_override: false,
  is_flagged: false,
  flag_type: null,
  flag_reason: null,
}

// One step of the recursive removal/reassignment workflow for a single
// vacancy on a PUBLISHED roster (see RosterVacancyManager for the stack that
// drives the recursion). `vacancy` = { entryId, date, shiftCode,
// currentProfileId }. `entries` is the manager's current working copy of
// the roster month's entries, used only for the same-day conflict check —
// this component doesn't own or refetch that list.
export default function RosterVacancyModal({ vacancy, entries, shiftTypes, profiles, displayNames, rosterMonthId, onResolved, onClose }) {
  const { user } = useAuth()
  const [step, setStep] = useState('choose') // 'choose' | 'swap'
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const doctor = profiles.find(p => p.id === vacancy.currentProfileId)

  async function handleOpenAdvertise() {
    setSaving(true)
    setError('')
    const { error: updateErr } = await supabase.from('roster_entries').update(VACATE_PATCH).eq('id', vacancy.entryId)
    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    const { error: adErr } = await supabase.from('shift_advertisements').insert({
      roster_entry_id: vacancy.entryId,
      advertised_by: user.id,
      status: 'open',
    })
    if (adErr) { setError(adErr.message); setSaving(false); return }

    await logRosterEntryChange({
      rosterMonthId, rosterEntryId: vacancy.entryId, entryDate: vacancy.date, shiftCode: vacancy.shiftCode,
      action: 'unassign', profileIdBefore: vacancy.currentProfileId, profileIdAfter: null,
      advertised: true, changedBy: user.id,
    })
    onResolved(null, applyEntryPatch(entries, vacancy.entryId, VACATE_PATCH))
  }

  async function handleOpenNoAdvertise() {
    setSaving(true)
    setError('')
    const { error: updateErr } = await supabase.from('roster_entries').update(VACATE_PATCH).eq('id', vacancy.entryId)
    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    await logRosterEntryChange({
      rosterMonthId, rosterEntryId: vacancy.entryId, entryDate: vacancy.date, shiftCode: vacancy.shiftCode,
      action: 'unassign', profileIdBefore: vacancy.currentProfileId, profileIdAfter: null,
      advertised: false, changedBy: user.id,
    })
    onResolved(null, applyEntryPatch(entries, vacancy.entryId, VACATE_PATCH))
  }

  async function handleSwapSelect(newProfileId) {
    setSaving(true)
    setError('')
    const patch = { profile_id: newProfileId, is_locum: false, locum_name: null, is_manual_override: true, is_flagged: false, flag_type: null, flag_reason: null }
    const { error: updateErr } = await supabase.from('roster_entries').update(patch).eq('id', vacancy.entryId)
    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    await logRosterEntryChange({
      rosterMonthId, rosterEntryId: vacancy.entryId, entryDate: vacancy.date, shiftCode: vacancy.shiftCode,
      action: 'assign', profileIdBefore: vacancy.currentProfileId, profileIdAfter: newProfileId,
      changedBy: user.id,
    })

    const updatedEntries = applyEntryPatch(entries, vacancy.entryId, patch)
    const conflict = findSameDayConflict({
      entries: updatedEntries,
      date: vacancy.date,
      profileId: newProfileId,
      excludeEntryId: vacancy.entryId,
    })

    if (conflict) {
      onResolved({
        entryId: conflict.id,
        date: conflict.date,
        shiftCode: shiftTypes[conflict.shift_type_id] || 'UNKNOWN',
        currentProfileId: newProfileId,
      }, updatedEntries)
    } else {
      onResolved(null, updatedEntries)
    }
  }

  if (step === 'swap') {
    return (
      <DoctorDropdown
        profiles={profiles.filter(p => p.id !== vacancy.currentProfileId)}
        displayNames={displayNames}
        search={search}
        onSearchChange={setSearch}
        onSelect={handleSwapSelect}
        onRemove={null}
        onClose={onClose}
        date={vacancy.date}
        shiftCode={vacancy.shiftCode}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium text-ink">
          {doctor ? `${doctor.name} ${doctor.surname}` : 'This doctor'} is on a published shift — {vacancy.shiftCode} on {vacancy.date}
        </p>
        <p className="mt-1 text-xs text-ink-muted">This roster is published — what should happen to this shift?</p>

        {error && <p className="mt-2 text-xs text-flagRed">{error}</p>}

        <div className="mt-4 space-y-2">
          <button onClick={handleOpenAdvertise} disabled={saving} className="btn-primary w-full">
            Open & advertise
          </button>
          <button onClick={handleOpenNoAdvertise} disabled={saving} className="btn-secondary w-full">
            Open, don&apos;t advertise
          </button>
          <button onClick={() => setStep('swap')} disabled={saving} className="btn-secondary w-full">
            Swap with another doctor
          </button>
        </div>

        <button onClick={onClose} disabled={saving} className="mt-3 w-full text-xs text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  )
}
