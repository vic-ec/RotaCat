// Path → label pairs, one set per role's nav (icons omitted — this is only
// used to label AppLayout's LAST_PATH_KEY for the Account Settings page's
// "Back to X" link). Keep in sync with the `to`/`label` pairs in the
// adminNav/doctorNav/locumNav/clerkNav arrays in components/AppLayout.jsx.
const NAV_LABELS = {
  admin: [
    { to: '/',         label: 'Dashboard' },
    { to: '/roster',   label: 'Roster' },
    { to: '/weekend',  label: 'Weekends' },
    { to: '/staff',    label: 'Staff' },
    { to: '/leave',    label: 'Leave' },
    { to: '/account',  label: 'Account' },
    { to: '/settings', label: 'Settings' },
  ],
  doctor: [
    { to: '/',        label: 'My shifts' },
    { to: '/roster',  label: 'Full roster' },
    { to: '/weekend', label: 'Weekends' },
    { to: '/leave',   label: 'My leave' },
    { to: '/swaps',   label: 'Swaps' },
    { to: '/account', label: 'Account' },
  ],
  locum: [
    { to: '/',        label: 'My shifts' },
    { to: '/roster',  label: 'Full roster' },
    { to: '/shifts',  label: 'Open shifts' },
    { to: '/swaps',   label: 'Swaps' },
    { to: '/account', label: 'Account' },
  ],
  clerk: [
    { to: '/',        label: 'Dashboard' },
    { to: '/roster',  label: 'Roster' },
    { to: '/weekend', label: 'Weekends' },
    { to: '/staff',   label: 'Staff' },
    { to: '/account', label: 'Account' },
  ],
}

// Human label for a path saved under AppLayout's LAST_PATH_KEY, used by the
// Account Settings page's "Back to X" link. Falls back to the role's home
// nav item for a path that isn't in the nav (e.g. a detail route, or
// nothing saved yet on a fresh page load).
export function navLabelForPath(pathname, { isAdmin, isLocum, isClerk }) {
  const items = isAdmin ? NAV_LABELS.admin
              : isLocum ? NAV_LABELS.locum
              : isClerk ? NAV_LABELS.clerk
              : NAV_LABELS.doctor
  const exact = items.find(item => item.to === pathname)
  if (exact) return exact.label
  const prefixMatch = items.find(item => item.to !== '/' && pathname.startsWith(item.to))
  return (prefixMatch || items[0]).label
}
