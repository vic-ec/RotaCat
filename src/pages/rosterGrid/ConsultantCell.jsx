import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSwatch } from '../../lib/useSwatch'
import DoctorDropdown from '../../components/DoctorDropdown'

// ── ConsultantCell ───────────────────────────────────────────────────────────
// Consultants pick from consultantProfiles via the same DoctorDropdown used
// for shift assignment, storing consultant_profile_id (colour-coded,
// disambiguated) rather than free text. consultant_name is only read here
// as a fallback for any pre-existing free-text rows -- clicking one still
// opens the dropdown, replacing it with a real profile on next save.
// isAdmin-gated like every other edit affordance in the grid (DoctorChip,
// the shift-cell "+" button) -- RLS already blocks the write for a
// non-admin, but the cell shouldn't offer a dropdown that just fails.
export default function ConsultantCell({ date, rosterMonthId, existing, consultantProfiles, displayNames, isAdmin, onRefresh }) {
  const swatch = useSwatch()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  async function assign(profileId) {
    setOpen(false)
    if (existing) {
      await supabase.from('roster_entries').update({ consultant_profile_id: profileId, consultant_name: null }).eq('id', existing.id)
    } else {
      const { data: stData } = await supabase.from('shift_types').select('id').eq('code', 'WD_08').single()
      if (stData) {
        await supabase.from('roster_entries').insert({
          roster_month_id: rosterMonthId,
          date,
          shift_type_id: stData.id,
          consultant_profile_id: profileId,
          position: 0,
        })
      }
    }
    onRefresh()
  }

  async function remove() {
    setOpen(false)
    if (existing) await supabase.from('roster_entries').delete().eq('id', existing.id)
    onRefresh()
  }

  const consultant = existing?.consultant_profile_id
    ? consultantProfiles.find(p => p.id === existing.consultant_profile_id)
    : null
  // Same slot treatment as DoctorChip — the consultant is one more name in
  // the row, so it should not be the one full-colour block left on it.
  const railColor = consultant?.color_code || '#4A90D9'

  return (
    <>
      <div onClick={isAdmin ? () => setOpen(true) : undefined} className={isAdmin ? 'cursor-pointer' : ''}>
        {consultant ? (
          <div
            className={`flex items-center rounded-sm border border-slate-line border-l-[3px] bg-canvas-raised px-1.5 py-0.5 text-[0.834em] font-medium text-ink ${isAdmin ? 'hover:bg-canvas-sunken' : ''}`}
            style={{ borderLeftColor: swatch.stroke(railColor) }}
          >
            <span className="truncate">{displayNames?.get(consultant.id) ?? consultant.surname}</span>
          </div>
        ) : existing?.consultant_name ? (
          <div className={`min-h-[20px] rounded px-1 py-0.5 text-[0.834em] text-ink-muted ${isAdmin ? 'hover:bg-canvas-sunken' : ''}`}>
            {existing.consultant_name}
          </div>
        ) : isAdmin ? (
          <div className="flex w-full items-center justify-center rounded border border-dashed border-accent/70 bg-canvas-raised/70 py-0.5 text-[0.834em] font-bold text-accent-dark hover:border-accent hover:bg-accent-light">
            +
          </div>
        ) : (
          <div className="min-h-[20px] px-1 py-0.5 text-[0.834em] text-ink-muted">—</div>
        )}
      </div>

      {isAdmin && open && (
        <DoctorDropdown
          profiles={consultantProfiles}
          displayNames={displayNames}
          search={search}
          onSearchChange={setSearch}
          onSelect={assign}
          onRemove={existing ? remove : null}
          removeLabel={consultant ? `Remove ${displayNames?.get(consultant.id) ?? consultant.surname} as consultant` : 'Remove consultant'}
          onClose={() => setOpen(false)}
          date={date}
          shiftCode="Consultant"
        />
      )}
    </>
  )
}
