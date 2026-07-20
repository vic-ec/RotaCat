import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import RotaCat from '../components/RotaCat'

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

// Profile picture if set, otherwise initials in the doctor's roster colour.
function UserAvatar({ profile, className }) {
  if (!profile) return null
  const initials = (profile.name?.[0] || '') + (profile.surname?.[0] || '')
  return profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt=""
      className={`flex-shrink-0 rounded-full object-cover ring-1 ring-slate-line ${className}`}
    />
  ) : (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-medium text-white ring-1 ring-slate-line ${className}`}
      style={{ backgroundColor: profile.color_code || '#4A90D9' }}
    >
      {initials}
    </div>
  )
}

// Mobile top-bar avatar: hover shows a "Logged in as X" tooltip; tap toggles it (no hover on touch).
function MobileAvatarWithTooltip({ profile, className }) {
  const [show, setShow] = useState(false)
  if (!profile) return null
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        title={`Logged in as ${profile.name} ${profile.surname}`}
        aria-label={`Logged in as ${profile.name} ${profile.surname}`}
        className="block"
      >
        <UserAvatar profile={profile} className={className} />
      </button>
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
  const { profile, signOut, isAdmin, isLocum, isClerk } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!location.pathname.startsWith('/account')) {
      sessionStorage.setItem(LAST_PATH_KEY, location.pathname)
    }
  }, [location.pathname])

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
            <UserAvatar profile={profile} className="h-10 w-10 text-sm" />
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
              <item.icon className="h-[18px] w-[18px]" />
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
          <MobileAvatarWithTooltip profile={profile} className="h-8 w-8 text-xs" />
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
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-accent/50 bg-canvas-raised md:hidden">
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
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
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
