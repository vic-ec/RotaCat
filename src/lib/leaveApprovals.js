// Tier-2 approval-time warnings for the leave approval queue — these FLAG
// for the admin to consciously acknowledge, they never block. Three checks:
//  1. supervision floor: removing this doctor from an already-rostered
//     shift would drop MO/Registrar coverage below constraints.min_supervision_per_shift
//  2. annual leave balance: approving would take annual_leave_balances
//     negative for a year touched by the request (skipped gracefully if no
//     balance row exists for that profile/year)
//  3. five_eighths hour ceiling: the doctor is already at/over their
//     contracted monthly hour ceiling for a month touched by the request.
//     This is a proxy, not a causal claim — approving/rejecting this leave
//     doesn't itself change already-rostered hours; it's surfaced here
//     because this is when the admin is looking at this doctor's month.
import { supabase } from './supabase'
import { datesInRange, monthBounds } from './dateRange'
import { annualDaysUsedInYear } from './leaveDashboard'

export function findSupervisionBreaches({ profileCategory, minSupervision, assignedSupervisionShifts }) {
  if (profileCategory !== 'MO' && profileCategory !== 'Registrar') return []
  return assignedSupervisionShifts.filter(s => s.remainingSupervisors < minSupervision)
}

export function checkAnnualBalance({ daysAllotted, daysAlreadyApproved, daysRequested }) {
  if (daysAllotted === null || daysAllotted === undefined) return { skipped: true }
  const remainingAfter = daysAllotted - daysAlreadyApproved - daysRequested
  return {
    skipped: false,
    wouldGoNegative: remainingAfter < 0,
    remainingAfter,
    daysAllotted,
    daysAlreadyApproved,
    daysRequested,
  }
}

export function checkFiveEighthsCeiling({ contractType, alreadyRosteredHours, maxHours }) {
  if (contractType !== 'five_eighths') return { flagged: false }
  return { flagged: alreadyRosteredHours >= maxHours, alreadyRosteredHours, maxHours }
}

function distinctYearMonths(dateFrom, dateTo) {
  const seen = new Map()
  for (const d of datesInRange(dateFrom, dateTo)) {
    const [y, m] = d.split('-').map(Number)
    seen.set(`${y}-${m}`, { year: y, month: m })
  }
  return [...seen.values()]
}

// Fetches everything needed and runs all three checks for one leave_requests
// row. Returns { supervisionBreaches, balanceWarnings, hourCeilingWarning }.
export async function getApprovalWarnings(leaveRequest) {
  const { profile_id: profileId, date_from: dateFrom, date_to: dateTo, leave_type: leaveType, annual_leave_days: annualLeaveDays } = leaveRequest

  const [profileRes, constraintRes] = await Promise.all([
    supabase.from('profiles').select('category, contract_type, max_hours').eq('id', profileId).single(),
    supabase.from('constraints').select('value').eq('key', 'min_supervision_per_shift').single(),
  ])
  const profile = profileRes.data || {}
  const minSupervision = Number(constraintRes.data?.value ?? 1)

  // ── 1. Supervision floor ──
  const { data: rangeEntries } = await supabase
    .from('roster_entries')
    .select('date, shift_type_id, profile_id, profiles(category)')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .not('profile_id', 'is', null)

  const ownShifts = (rangeEntries || []).filter(e => e.profile_id === profileId)
  const assignedSupervisionShifts = ownShifts.map(own => {
    const remainingSupervisors = (rangeEntries || []).filter(e =>
      e.date === own.date && e.shift_type_id === own.shift_type_id
      && e.profile_id !== profileId
      && (e.profiles?.category === 'MO' || e.profiles?.category === 'Registrar')
    ).length
    return { date: own.date, shiftTypeId: own.shift_type_id, remainingSupervisors }
  })
  const supervisionBreaches = findSupervisionBreaches({
    profileCategory: profile.category,
    minSupervision,
    assignedSupervisionShifts,
  })

  // ── 2. Annual leave balance ──
  // This pending request's own day count is attributed wholesale to the
  // year it starts in — a deliberate simplification for this one-off
  // approval-time warning check, unlike annualDaysUsedInYear (used just
  // below for historical daysAlreadyApproved), which prorates a request
  // across a year boundary by calendar-day overlap. Extending this check to
  // weigh both years for a boundary-spanning pending request would need it
  // to evaluate two balances at once instead of one; not done here since
  // this is a soft Tier-2 warning, not the balance figure shown on the
  // tracker itself. Legacy rows without annual_leave_days (either this
  // request under review, or a historical approved one) fall back to the
  // full date-range day count.
  const balanceWarnings = []
  if (leaveType === 'annual') {
    const year = Number(dateFrom.slice(0, 4))
    const daysRequested = annualLeaveDays != null ? Number(annualLeaveDays) : datesInRange(dateFrom, dateTo).length

    const [balanceRes, approvedRes] = await Promise.all([
      supabase.from('annual_leave_balances').select('days_allotted').eq('profile_id', profileId).eq('year', year).maybeSingle(),
      supabase.from('leave_requests').select('date_from, date_to, annual_leave_days').eq('profile_id', profileId).eq('leave_type', 'annual').eq('status', 'approved'),
    ])
    const daysAlreadyApproved = annualDaysUsedInYear(approvedRes.data || [], year)

    const result = checkAnnualBalance({
      daysAllotted: balanceRes.data?.days_allotted ?? null,
      daysAlreadyApproved,
      daysRequested,
    })
    if (!result.skipped && result.wouldGoNegative) balanceWarnings.push({ year, ...result })
  }

  // ── 3. Five-eighths hour ceiling ──
  let hourCeilingWarning = null
  if (profile.contract_type === 'five_eighths') {
    for (const { year, month } of distinctYearMonths(dateFrom, dateTo)) {
      const { start, end } = monthBounds(year, month)
      const { data: monthEntries } = await supabase
        .from('roster_entries')
        .select('counts_toward_contract_hours, extra_hours, shift_types(duration_hours)')
        .eq('profile_id', profileId)
        .gte('date', start)
        .lte('date', end)
      const alreadyRosteredHours = (monthEntries || [])
        .filter(e => e.counts_toward_contract_hours)
        .reduce((sum, e) => sum + Number(e.shift_types?.duration_hours || 0) + Number(e.extra_hours || 0), 0)

      const result = checkFiveEighthsCeiling({
        contractType: profile.contract_type,
        alreadyRosteredHours,
        maxHours: profile.max_hours,
      })
      if (result.flagged) { hourCeilingWarning = { year, month, ...result }; break }
    }
  }

  return { supervisionBreaches, balanceWarnings, hourCeilingWarning }
}
