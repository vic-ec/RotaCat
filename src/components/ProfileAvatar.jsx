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

// Renders a profile's photo (or colour-coded initials) using their identity
// colour (profiles.color_code) and chosen pattern (profiles.pattern_type).
//
// With no photo, the pattern tiles across the whole circle behind the
// initials — there's no photo competing for space, so it has room to repeat
// cleanly. With a photo, the pattern instead tiles in a thick ring around it
// (at a smaller tile size, since the ring is a much narrower band) — a photo
// covers the whole circle, so the ring is the only place identity colour and
// pattern can still show through.
export default function ProfileAvatar({ profile, size = 40, className = '' }) {
  const initials = (profile?.name?.[0] || '') + (profile?.surname?.[0] || '')
  const color = profile?.color_code || NEUTRAL_AVATAR_COLOR

  if (profile?.avatar_url) {
    const ringWidth = Math.max(3, Math.round(size * 0.12))
    const patternStyle = profile?.pattern_type
      ? patternBackgroundStyle(profile.pattern_type, color, Math.max(6, Math.round(size / 8)))
      : null
    return (
      <div
        className={`relative flex-shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size, padding: ringWidth, backgroundColor: color, ...patternStyle }}
      >
        <div className="h-full w-full overflow-hidden rounded-full">
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        </div>
      </div>
    )
  }

  const patternStyle = profile?.pattern_type
    ? patternBackgroundStyle(profile.pattern_type, color, Math.max(8, Math.round(size / 4)))
    : null

  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-medium ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        color: contrastTextColor(color),
        fontSize: Math.max(10, Math.round(size * 0.32)),
        ...patternStyle,
      }}
    >
      {initials}
    </div>
  )
}
