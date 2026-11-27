// Where a leave request opens from the "My year" page: a pending request
// in the Requests list, annual leave on the Annual planner's month, any
// other type on the Special planner's month. A planner opens on the
// request's first day, selected (its day panel or sheet open).
export function requestLink(request) {
  const month = request.date_from.slice(0, 7)
  if (request.status === 'pending') return { label: 'Request', to: '/leave?tab=requests' }
  if (request.leave_type === 'annual') {
    return { label: 'Annual planner', to: `/leave?tab=planners&sub=annual&month=${month}&highlight=${request.date_from}` }
  }
  return {
    label: 'Special planner',
    to: `/leave?tab=planners&sub=special&syear=${month.slice(0, 4)}&sview=workspace&smonth=${Number(month.slice(5, 7))}&sday=${request.date_from}`,
  }
}

// One doctor's leave on Team Leave → Matrix: their row, the request's year,
// the request's bar selected (admins; the Matrix needs a wide screen).
export function teamLeaveLink(request) {
  const params = new URLSearchParams({
    tab: 'team', sub: 'current', ldoctor: request.profile_id, lyear: request.date_from.slice(0, 4), lrequest: request.id,
  })
  return `/leave?${params.toString()}`
}

// A month on the planner that suits what is in it.
export function plannerMonthLink(year, month, { special = false } = {}) {
  const mm = String(month).padStart(2, '0')
  return special
    ? `/leave?tab=planners&sub=special&syear=${year}&sview=workspace&smonth=${month}`
    : `/leave?tab=planners&sub=annual&month=${year}-${mm}`
}

export const ALL_LEAVE_PATH = '/leave?tab=team&sub=all'
export const MY_LEAVE_PATH = '/leave?tab=my-leave'

export function myYearPath(profileId, { tab, year } = {}) {
  const params = new URLSearchParams()
  if (tab) params.set('tab', tab)
  if (year) params.set('year', String(year))
  const query = params.toString()
  return `/my-year${profileId ? `/${profileId}` : ''}${query ? `?${query}` : ''}`
}

// Where a leave request opens from My year, so the link lands on that
// request (or its day), never on a page it isn't on:
//   rejected / cancelled    nowhere (no planner shows it; the roster link stays)
//   sick                    the request itself: the doctor's My Requests,
//                           scrolled to it; an admin's Team Leave matrix on a
//                           wide screen; else the person's My year Leave tab,
//                           scrolled to it (none from that tab itself)
//   pending                 the doctor's My Requests at it; an admin's queue
//   annual / special        that month on its planner (requestLink)
// `teamLeave` (the Overview's desktop panel for an admin) sends every type
// to Team Leave's matrix instead. Returns { to, label, kind } or null;
// kind is 'planner' or 'request', for the icon.
export function leaveDestination(request, { isAdmin = false, own = false, wide = false, profileId = null, inLeaveTab = false, teamLeave = false } = {}) {
  if (!request || request.status === 'rejected' || request.status === 'cancelled') return null
  const doctorOwn = own && !isAdmin
  const myRequests = { to: `/leave?tab=requests&request=${request.id}`, label: 'My Requests', kind: 'request' }
  if (isAdmin && wide && (teamLeave || request.leave_type === 'sick')) return { to: teamLeaveLink(request), label: 'Team Leave', kind: 'request' }
  if (request.leave_type === 'sick') {
    if (doctorOwn) return myRequests
    if (inLeaveTab) return null
    const base = myYearPath(own ? null : profileId, { tab: 'leave', year: request.date_from.slice(0, 4) })
    return { to: `${base}&request=${request.id}`, label: 'Leave record', kind: 'request' }
  }
  if (request.status === 'pending') return doctorOwn ? myRequests : { to: '/leave?tab=requests', label: 'Requests', kind: 'request' }
  const r = requestLink(request)
  return { to: r.to, label: r.label, kind: 'planner' }
}
