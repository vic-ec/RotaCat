import { contrastTextColor, NEUTRAL_AVATAR_COLOR } from '../lib/color'
import { patternBackgroundStyle } from '../lib/avatarPatterns'

function CheckIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

// Small inline active/inactive indicator — green check, or a plain orange dot
// for inactive. Meant to sit next to a name/surname, not on the avatar.
export function StatusBadge({ active, size = 16, className = '' }) {
  if (!active) {
    return (
      <span
        className={`inline-flex flex-shrink-0 rounded-full bg-flagAmber ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Inactive"
      />
    )
  }
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-success ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Active"
    >
      <CheckIcon className="h-2.5 w-2.5 text-white" />
    </span>
  )
}

// Renders a profile's photo (or colour-coded initials) with a thick identity
// ring in their colour (profiles.color_code), tiled with their chosen pattern
// (profiles.pattern_type) when set. The ring is a padding band around the
// photo/initials rather than a thin box-shadow outline, so it stays visible
// (and shows the pattern) even when a real photo covers most of the circle.
// Shared between the Staff list rows and the Account Settings preview.
export default function ProfileAvatar({ profile, size = 40, className = '' }) {
  const initials = (profile?.name?.[0] || '') + (profile?.surname?.[0] || '')
  const color = profile?.color_code || NEUTRAL_AVATAR_COLOR
  const ringWidth = Math.max(3, Math.round(size * 0.12))
  const patternStyle = profile?.pattern_type
    ? patternBackgroundStyle(profile.pattern_type, color, Math.max(10, Math.round(size / 4)))
    : null

  return (
    <div
      className={`relative flex-shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, padding: ringWidth, backgroundColor: color, ...patternStyle }}
    >
      <div className="h-full w-full overflow-hidden rounded-full">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-medium"
            style={{ backgroundColor: color, color: contrastTextColor(color), fontSize: Math.max(10, Math.round(size * 0.32)) }}
          >
            {initials}
          </div>
        )}
      </div>
    </div>
  )
}
