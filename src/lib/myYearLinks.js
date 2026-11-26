// Where a leave request opens from the "My year" page: a pending request
// in the Requests list, annual leave on the Annual planner's month, any
// other type on the Special planner's month.
export function requestLink(request) {
  const month = request.date_from.slice(0, 7)
  if (request.status === 'pending') return { label: 'Request', to: '/leave?tab=requests' }
  if (request.leave_type === 'annual') {
    return { label: 'Annual planner', to: `/leave?tab=planners&sub=annual&month=${month}&highlight=${request.id}` }
  }
  return {
    label: 'Special planner',
    to: `/leave?tab=planners&sub=special&syear=${month.slice(0, 4)}&sview=workspace&smonth=${Number(month.slice(5, 7))}`,
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
