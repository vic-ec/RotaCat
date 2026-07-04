import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import lilyIcon from '../assets/Lily-robot-icon.png'
import RotaCat from '../components/RotaCat'

const adminNav = [
  { to: '/', label: 'Dashboard', icon: HomeIcon },
  { to: '/roster', label: 'Roster', icon: CalendarIcon },
  { to: '/staff', label: 'Staff', icon: UsersIcon },
  { to: '/leave', label: 'Leave requests', icon: ClipboardIcon },
  { to: '/settings', label: 'Rules & settings', icon: SlidersIcon }
]

const doctorNav = [
  { to: '/', label: 'My shifts', icon: HomeIcon },
  { to: '/roster', label: 'Full roster', icon: CalendarIcon },
  { to: '/leave', label: 'My leave', icon: ClipboardIcon },
  { to: '/swaps', label: 'Swaps', icon: SwapIcon }
]

export default function AppLayout() {
  const { profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const navItems = isAdmin ? adminNav : doctorNav

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 flex-col border-r border-slate-line bg-canvas-raised md:flex">
        <div className="px-5 py-6">
          <div className="flex items-center gap-2.5">
            <img
              src={lilyIcon}
              alt=""
              className="h-8 w-8 object-contain"
              draggable="false"
            />
            <h1 className="font-display text-lg font-medium text-ink"><RotaCat /></h1>
          </div>
          {profile && (
            <p className="mt-2 text-xs text-ink-muted">
              {profile.name} {profile.surname} · {isAdmin ? 'Admin' : profile.category}
            </p>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-tint text-accent-dark'
                    : 'text-ink-light hover:bg-canvas-sunken'
                }`
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-line p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-medium text-ink-light hover:bg-canvas-sunken"
          >
            <LogoutIcon className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Top bar — mobile only. Bottom nav is for primary navigation;
          sign-out lives here so it doesn't have to compete for space
          in an already-full bottom row. */}
      <header className="fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b border-slate-line bg-canvas-raised px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <img src={lilyIcon} alt="" className="h-6 w-6 object-contain" draggable="false" />
          <span className="font-display text-base font-medium text-ink"><RotaCat /></span>
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-ink-light hover:bg-canvas-sunken"
        >
          <LogoutIcon className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col pb-16 pt-14 md:pb-0 md:pt-0">
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav — mobile, primary navigation only */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-slate-line bg-canvas-raised md:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
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

/* ---- Inline icon components (no external icon library needed) ---- */

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
function LogoutIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
