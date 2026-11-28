// The roster's Leave and Course columns, as the paper roster has them: who
// is away on each day, read live from approved leave (leaveByProfile, the
// same map that strikes through a doctor on leave), so leave approved or
// cancelled after the roster was built still shows correctly.
//
// Course: study leave, workshops, courses and conferences (the matrix's
// "Study / Training" family). Leave: every other type. "Weekend off" is a
// change to which weekend someone works, not time away, so it is in
// neither. A range whose type this viewer cannot see (null) counts as
// leave: the person is away, which is all the column claims.
import { leaveTypeGroupKey, LEAVE_GROUP_OPTIONS } from './leaveMatrix'
import { leaveTypeCode } from './leaveRequests'

const NOT_AWAY = new Set(['weekend_exception'])

// The order within a day: by leave type (the matrix's group order: Annual,
// Sick, Family / Special, Study…, then the type's code within a group; a
// type this viewer can't see last), then by surname. The initial the
// roster adds to tell two of a surname apart ("A. Van Zyl") is ignored, so
// Van Zyl sorts under V.
const GROUP_RANK = new Map(LEAVE_GROUP_OPTIONS.map((g, i) => [g.key, i]))
const surnameKey = name => String(name || '').replace(/^\p{Lu}\.\s+/u, '')
function byTypeThenSurname(a, b) {
  const ga = a.type ? GROUP_RANK.get(leaveTypeGroupKey(a.type)) ?? 98 : 99
  const gb = b.type ? GROUP_RANK.get(leaveTypeGroupKey(b.type)) ?? 98 : 99
  if (ga !== gb) return ga - gb
  const codes = (a.code || '').localeCompare(b.code || '')
  if (codes) return codes
  return surnameKey(a.name).localeCompare(surnameKey(b.name)) || a.name.localeCompare(b.name)
}

// { [date]: { leave: [{ profileId, name, type, code }], course: [...] } } for each
// date in `dates`, sorted by leave type then surname (byTypeThenSurname). `nameOf(profileId)` returns the short
// roster name, or a falsy value to leave someone out (not on this roster's
// staff list).
export function leaveByDate(leaveByProfile, dates, nameOf) {
  const out = {}
  for (const date of dates) out[date] = { leave: [], course: [] }
  for (const [profileId, ranges] of Object.entries(leaveByProfile || {})) {
    const name = nameOf(profileId)
    if (!name) continue
    for (const [from, to, type] of ranges || []) {
      if (type && NOT_AWAY.has(type)) continue
      const bucket = type && leaveTypeGroupKey(type) === 'study' ? 'course' : 'leave'
      for (const date of dates) {
        if (date < from || date > to) continue
        const list = out[date][bucket]
        // One line per person per column, even with overlapping ranges.
        if (!list.some(p => p.profileId === profileId)) list.push({ profileId, name, type: type || null, code: type ? leaveTypeCode(type) : '' })
      }
    }
  }
  for (const date of dates) {
    out[date].leave.sort(byTypeThenSurname)
    out[date].course.sort(byTypeThenSurname)
  }
  return out
}

// "Rivers (AL), Duma · Course: Naidoo (CW)" — the phone's one-line summary.
export function awaySummary({ leave, course }) {
  const list = people => people.map(p => (p.code ? `${p.name} (${p.code})` : p.name)).join(', ')
  return [leave.length ? `Leave: ${list(leave)}` : '', course.length ? `Course: ${list(course)}` : ''].filter(Boolean).join(' · ')
}
