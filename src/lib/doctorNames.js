// Surname-only display (weekend planner cards/tables, leave-planner day
// cells, the roster grid) reads fine until two doctors share a surname —
// "Nolan" on its own doesn't say which one. buildDoctorDisplayNames
// resolves that ambiguity irrespective of category/role: a surname shared
// by 2+ doctors anywhere in the given list gets a first-initial prefix
// ("J. Nolan"); if the initial ALSO collides (two "J. Nolan"s), those
// specific doctors fall back further to their full first name ("James
// Nolan", "Jerome Nolan") instead. A surname held by exactly one doctor
// stays exactly as before (bare surname) — this only ever adds detail
// where real ambiguity exists, never a global "always show initials" mode.
//
// Returns a Map<profileId, string> — every doctor object needs `id`,
// `name` (first name), and `surname`. Callers own their own doctor pool
// (Weekend Planner's rotation-eligible list, the Leave planner's full
// active roster, the roster grid's staff list, ...) — this function makes
// no assumption about which subset of staff it's given, since "irrespective
// of category" means the caller decides scope, not this utility.
export function buildDoctorDisplayNames(doctors) {
  const bySurname = new Map()
  for (const doctor of doctors) {
    if (!bySurname.has(doctor.surname)) bySurname.set(doctor.surname, [])
    bySurname.get(doctor.surname).push(doctor)
  }

  const displayName = new Map()
  for (const [surname, group] of bySurname) {
    if (group.length === 1) {
      displayName.set(group[0].id, surname)
      continue
    }

    const byInitial = new Map()
    for (const doctor of group) {
      const initial = (doctor.name || '').charAt(0).toUpperCase()
      if (!byInitial.has(initial)) byInitial.set(initial, [])
      byInitial.get(initial).push(doctor)
    }

    for (const [initial, initialGroup] of byInitial) {
      if (initialGroup.length === 1) {
        displayName.set(initialGroup[0].id, initial ? `${initial}. ${surname}` : surname)
      } else {
        for (const doctor of initialGroup) {
          displayName.set(doctor.id, doctor.name ? `${doctor.name} ${surname}` : surname)
        }
      }
    }
  }
  return displayName
}
