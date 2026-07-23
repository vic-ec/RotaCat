import { contrastTextColor, NEUTRAL_AVATAR_COLOR } from '../lib/color'

function CheckIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Small inline active/inactive indicator — green check or red cross in a
// colour-filled circle. Meant to sit next to a name/surname, not on the avatar.
export function StatusBadge({ active, size = 16, className = '' }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full ${active ? 'bg-success' : 'bg-flagRed'} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={active ? 'Active' : 'Inactive'}
    >
      {active ? (
        <CheckIcon className="h-2.5 w-2.5 text-white" />
      ) : (
        <XIcon className="h-2.5 w-2.5 text-white" />
      )}
    </span>
  )
}

// Renders a profile's photo (or colour-coded initials) with a ring in their
// identity colour (profiles.color_code). Shared between the Staff list rows
// and the Account Settings colour/pattern preview.
export default function ProfileAvatar({ profile, size = 40, className = '' }) {
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
    </div>
  )
}
