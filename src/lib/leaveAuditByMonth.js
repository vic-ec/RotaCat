// All Leave's "By month" view: one row per doctor for a calendar year —
// days on leave in each month, the annual / sick / other split, and how
// long since their last break. The day rules are myYear.js's, so a row
// here always agrees with that doctor's own "My year" page.
import { buildMonthRow, breakSummary } from './myYear'

// Four shade steps for a month cell: none, 1–2, 3–5, 6 or more.
export const MONTH_SHADES = [
  { step: 0, label: 'None' },
  { step: 1, label: '1–2 days' },
  { step: 2, label: '3–5 days' },
  { step: 3, label: '6 or more' },
]

export function monthShadeStep(days) {
  if (days >= 6) return 3
  if (days >= 3) return 2
  if (days >= 1) return 1
  return 0
}

// "Since last break": a day count when the last break was this year, "None
// this year" when it was earlier, "None since joining" with none on record.
// `long` once the days since it pass the threshold. `breakRequests` null
// means the look-back has not arrived yet.
export function sinceLastBreak(breakRequests, year, today, longBreakDays) {
  if (!breakRequests) return { kind: 'loading', days: null, long: false }
  const { last, breakThisYear } = breakSummary(breakRequests, year, today)
  if (!last) return { kind: 'none_since_joining', days: null, long: false }
  const long = !last.ongoing && last.daysAgo > longBreakDays
  return { kind: breakThisYear ? 'days' : 'none_this_year', days: last.daysAgo, long }
}

export function sinceLastBreakText(since) {
  if (since.kind === 'loading') return '…'
  if (since.kind === 'none_since_joining') return 'None since joining'
  if (since.kind === 'none_this_year') return 'None this year'
  return `${since.days} day${since.days === 1 ? '' : 's'}`
}

// profiles      every doctor to list (zero-leave doctors included)
// requests      leave_requests touching the year (after any type filter)
// breakRequests approved requests for the break look-back, all years and
//               unfiltered by type; null while still loading
export function buildMonthAuditRows(profiles, requests, year, { today, allowance, longBreakDays, breakRequests = null } = {}) {
  const group = rows => {
    const map = new Map()
    for (const r of rows || []) {
      if (!map.has(r.profile_id)) map.set(r.profile_id, [])
      map.get(r.profile_id).push(r)
    }
    return map
  }
  const byProfile = group(requests)
  const breaksByProfile = breakRequests ? group(breakRequests) : null

  return profiles
    .map(profile => {
      const row = buildMonthRow(byProfile.get(profile.id) || [], year)
      return {
        profileId: profile.id,
        name: profile.name,
        surname: profile.surname,
        category: profile.category,
        contractType: profile.contract_type ?? null,
        psychSubcategory: profile.psych_subcategory ?? null,
        colorCode: profile.color_code ?? null,
        ...row,
        annualLeft: allowance - row.annual,
        sinceBreak: sinceLastBreak(breaksByProfile ? (breaksByProfile.get(profile.id) || []) : null, year, today, longBreakDays),
      }
    })
    .sort((a, b) => a.surname.localeCompare(b.surname))
}
