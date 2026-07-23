import { contrastTextColor, NEUTRAL_AVATAR_COLOR } from '../lib/color'

function CheckIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ClosedEyeIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" d="M4 12c2.5 3 5.2 4.5 8 4.5s5.5-1.5 8-4.5" />
    </svg>
  )
}

// Renders a profile's photo (or colour-coded initials) with a ring in their
// identity colour (profiles.color_code), and optionally a small active/inactive
// status badge overlapping the top-right corner. Shared between the Staff list
// rows and the Account Settings colour/pattern preview.
export default function ProfileAvatar({ profile, size = 40, showStatus = false, className = '' }) {
  const initials = (profile?.name?.[0] || '') + (profile?.surname?.[0] || '')
  const color = profile?.color_code || NEUTRAL_AVATAR_COLOR
  const dotSize = Math.max(6, Math.round(size / 5))
  const fillStyle = profile?.has_pattern && profile?.pattern_dot_color
    ? {
        backgroundColor: color,
        backgroundImage: `radial-gradient(${profile.pattern_dot_color} 32%, transparent 33%)`,
        backgroundSize: `${dotSize}px ${dotSize}px`,
      }
    : { backgroundColor: color }

  const badgeSize = Math.max(14, Math.round(size * 0.4))

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt=""
          className="h-full w-full rounded-full object-cover ring-2"
          style={{ '--tw-ring-color': color }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-medium ring-2"
          style={{ ...fillStyle, '--tw-ring-color': color, color: contrastTextColor(color), fontSize: Math.max(10, Math.round(size * 0.32)) }}
        >
          {initials}
        </div>
      )}
      {showStatus && (
        <span
          className={`absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2 ring-canvas-raised ${
            profile?.is_active ? 'bg-success' : 'bg-flagAmber'
          }`}
          style={{ width: badgeSize, height: badgeSize }}
        >
          {profile?.is_active ? (
            <CheckIcon className="h-2.5 w-2.5 text-white" />
          ) : (
            <ClosedEyeIcon className="h-2.5 w-2.5 text-white" />
          )}
        </span>
      )}
    </div>
  )
}
