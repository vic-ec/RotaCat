import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import RotaCat from '../components/RotaCat'
import ProfileAvatar, { StatusPicker } from '../components/ProfileAvatar'

// ── Nav sets per role ──────────────────────────────────────
// Each role sees a tailored nav — preserving the original
// adminNav / doctorNav pattern and extending it for locum + clerk.

const adminNav = [
  { to: '/',       label: 'Dashboard',   icon: HomeIcon,      end: true },
  { to: '/roster', label: 'Roster',      icon: CalendarIcon },
  { to: '/staff',  label: 'Staff',       icon: UsersIcon },
  { to: '/leave',  label: 'Leave',       icon: ClipboardIcon },
  { to: '/account', label: 'Account',    icon: UserIcon },
  { to: '/settings', label: 'Settings',  icon: SlidersIcon },
]

const doctorNav = [
  { to: '/',       label: 'My shifts',   icon: HomeIcon,      end: true },
  { to: '/roster', label: 'Full roster', icon: CalendarIcon },
  { to: '/leave',  label: 'My leave',    icon: ClipboardIcon },
  { to: '/swaps',  label: 'Swaps',       icon: SwapIcon },
  { to: '/account', label: 'Account',    icon: UserIcon },
]

// Locums: see roster and open shifts, can request locum↔locum swaps.
// No leave, no weekend grid (enforced via canViewWeekendGrid in those pages).
const locumNav = [
  { to: '/',       label: 'My shifts',   icon: HomeIcon,      end: true },
  { to: '/roster', label: 'Full roster', icon: CalendarIcon },
  { to: '/shifts', label: 'Open shifts', icon: ShiftIcon },
  { to: '/swaps',  label: 'Swaps',       icon: SwapIcon },
  { to: '/account', label: 'Account',    icon: UserIcon },
]

// Clerks: read-only. Roster, weekend grid, contact list only.
const clerkNav = [
  { to: '/',       label: 'Dashboard',   icon: HomeIcon,      end: true },
  { to: '/roster', label: 'Roster',      icon: CalendarIcon },
  { to: '/staff',  label: 'Staff',       icon: UsersIcon },
  { to: '/account', label: 'Account',    icon: UserIcon },
]

const ROLE_CATEGORY_LABEL = {
  MO:          'EC Medical Officer',
  Registrar:   'Registrar',
  EC_COSMO:    'EC Intern / COSMO',
  OT_COSMO:    'OT Intern / COSMO',
  COSMO_Psych: 'OT Intern / COSMO (Psych)',
  Consultant:  'Consultant',
  Locum:       'Locum',
  COSMO:       'COSMO',       // legacy value
  COSMOPsych:  'COSMO Psych', // legacy value
}

// Remembers the last non-account page visited, so the Account Settings
// page can offer a "Back to X" link even on a fresh page load.
export const LAST_PATH_KEY = 'rotacat:lastNonAccountPath'

// Profile picture if set, otherwise initials — shown with the doctor's
// identity colour + pattern (matches the Staff list / Account Settings avatar).
// The status badge in the corner is always the logged-in user's own here (the
// sidebar only ever shows one's own profile), so it's always click-to-change.
function UserAvatar({ profile, size = 40, onLeave = false, onSetActive }) {
  if (!profile) return null
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <ProfileAvatar profile={profile} size={size} />
      <StatusPicker
        active={profile.is_active !== false}
        onLeave={onLeave}
        size={Math.max(12, Math.round(size * 0.35))}
        interactive
        onSetActive={onSetActive}
      />
    </div>
  )
}

// Mobile top-bar avatar: hover shows a "Logged in as X" tooltip; tap toggles it (no hover on touch).
// The status badge is a separate sibling (not nested in the tooltip button) so
// the two don't end up as a button-inside-a-button.
function MobileAvatarWithTooltip({ profile, size, onLeave, onSetActive }) {
  const [show, setShow] = useState(false)
  if (!profile) return null
  return (
    <div className="group relative" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        title={`Logged in as ${profile.name} ${profile.surname}`}
        aria-label={`Logged in as ${profile.name} ${profile.surname}`}
        className="block"
      >
        <ProfileAvatar profile={profile} size={size} />
      </button>
      <StatusPicker
        active={profile.is_active !== false}
        onLeave={onLeave}
        size={Math.max(12, Math.round(size * 0.35))}
        interactive
        onSetActive={onSetActive}
      />
      <div
        className={`pointer-events-none absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded bg-ink px-2 py-1 text-[11px] text-white shadow-card transition-opacity ${
          show ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        Logged in as {profile.name} {profile.surname}
      </div>
    </div>
  )
}

export default function AppLayout() {
  const { profile, signOut, isAdmin, isLocum, isClerk, setMyActiveStatus } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [staffBadgeCount, setStaffBadgeCount] = useState(0)
  const [myOnLeave, setMyOnLeave] = useState(false)

  // Own on-leave status, for the status badge shown on the sidebar/top-bar
  // avatar — mirrors the same approved-leave lookup used on the Account and
  // Staff list pages.
  useEffect(() => {
    if (!profile?.id) { setMyOnLeave(false); return }
    let cancelled = false
    supabase.rpc('get_current_leave_profile_ids').then(({ data }) => {
      if (!cancelled) setMyOnLeave((data || []).some(r => r.profile_id === profile.id))
    })
    return () => { cancelled = true }
  }, [profile?.id])

  useEffect(() => {
    if (!location.pathname.startsWith('/account')) {
      sessionStorage.setItem(LAST_PATH_KEY, location.pathname)
    }
  }, [location.pathname])

  // Combined "needs admin attention" count for the Staff nav badge — new
  // registrations awaiting approval, plus pending account change requests.
  // Refetched on every navigation so it stays fresh after acting on either
  // list from the Staff page itself.
  useEffect(() => {
    if (!isAdmin) { setStaffBadgeCount(0); return }
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_approved', false).eq('is_rejected', false),
      supabase.from('account_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]).then(([pendingRes, requestsRes]) => {
      if (!cancelled) setStaffBadgeCount((pendingRes.count || 0) + (requestsRes.count || 0))
    })
    return () => { cancelled = true }
  }, [isAdmin, location.pathname])

  const navItems = isAdmin  ? adminNav
                 : isLocum  ? locumNav
                 : isClerk  ? clerkNav
                 : doctorNav

  // Subtitle under the name in the sidebar
  const subtitle = isAdmin  ? 'Admin'
                 : isLocum  ? 'Locum'
                 : isClerk  ? 'Clerk'
                 : ROLE_CATEGORY_LABEL[profile?.category] || profile?.category || 'Doctor'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-accent-light">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col border-r border-accent/50 bg-canvas-raised md:flex">
        <div className="px-5 py-6">
          <div className="flex items-center gap-2">
            <UserAvatar profile={profile} size={40} onLeave={myOnLeave} onSetActive={setMyActiveStatus} />
            <h1 className="font-display text-2xl font-medium text-ink"><RotaCat /></h1>
          </div>
          {profile && (
            <p className="mt-3 text-xs text-ink-muted">
              {profile.name} {profile.surname} · {subtitle}
            </p>
          )}
          {!profile?.is_approved && (
            <p className="mt-1 text-xs text-flagAmber">Pending approval</p>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-canvas-raised'
                    : 'text-ink-light hover:bg-accent-light hover:text-ink-light active:bg-accent active:text-canvas-raised'
                }`
              }
            >
              <span className="relative inline-flex">
                <item.icon className="h-[18px] w-[18px]" />
                {item.to === '/staff' && staffBadgeCount > 0 && (
                  <NavBadge count={staffBadgeCount} />
                )}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-accent/25 p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-medium text-ink-light transition-colors hover:bg-accent-light hover:text-ink-light active:bg-accent active:text-canvas-raised"
          >
            <LogoutIcon className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Top bar — mobile only */}
      <header className="fixed inset-x-0 top-0 z-10 flex items-center justify-between gap-2 border-b border-accent/50 bg-canvas-raised px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <MobileAvatarWithTooltip profile={profile} size={32} onLeave={myOnLeave} onSetActive={setMyActiveStatus} />
          <span className="font-display text-xl font-medium text-ink"><RotaCat /></span>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="group flex flex-shrink-0 items-center gap-1.5 overflow-hidden rounded px-2 py-1.5 text-xs font-medium text-ink-light hover:bg-accent-light"
        >
          <LogoutIcon className="h-[18px] w-[18px] flex-shrink-0" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[70px] group-hover:opacity-100">
            Sign out
          </span>
        </button>
      </header>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 pt-14 md:pb-0 md:pt-0">
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav — mobile, primary navigation only */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-accent/50 bg-canvas-raised md:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                isActive ? 'text-accent-dark' : 'text-ink-muted'
              }`
            }
          >
            <span className="relative inline-flex">
              <item.icon className="h-5 w-5" />
              {item.to === '/staff' && staffBadgeCount > 0 && (
                <NavBadge count={staffBadgeCount} />
              )}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

// Small count badge overlapping the top-right corner of a nav icon.
function NavBadge({ count }) {
  return (
    <span
      className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-flagRed px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-canvas-raised"
      aria-label={`${count} pending`}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

/* ── Inline icon components ─────────────────────────────── */

function HomeIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" />
    </svg>
  )
}
function CalendarIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}
function UsersIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="8" r="3" />
      <path strokeLinecap="round" d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8a3 3 0 100-6M16.5 14c2.5.2 4.5 2.6 4.5 6" />
    </svg>
  )
}
function ClipboardIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path strokeLinecap="round" d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1M8 11h8M8 15h8" />
    </svg>
  )
}
function SlidersIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M22 18h-2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  )
}
function SwapIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h13l-3-3M20 17H7l3 3" />
    </svg>
  )
}
function ShiftIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}
function UserIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  )
}
function LogoutIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
