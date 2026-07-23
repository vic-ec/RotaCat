import { contrastTextColor, NEUTRAL_AVATAR_COLOR } from '../lib/color'
import { patternBackgroundStyle } from '../lib/avatarPatterns'

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

// Small inline status indicator, meant to sit next to a name/surname (not on
// the avatar itself) — green check (active), red circle with a white X
// (inactive), or a beach emoji (active but currently on approved leave).
// Inactive takes priority over on-leave since it's the more permanent state.
export function StatusBadge({ active, onLeave, size = 16, className = '' }) {
  if (!active) {
    return (
      <span
        className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-flagRed ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Inactive"
      >
        <XIcon className="h-2.5 w-2.5 text-white" />
      </span>
    )
  }
  if (onLeave) {
    return (
      <span
        className={`inline-flex flex-shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.85), lineHeight: 1 }}
        role="img"
        aria-label="On leave"
        title="On leave"
      >
        🏖️
      </span>
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
// First name initial, plus one initial per word of the (possibly multi-part)
// surname — "Liza van Zyl" -> "LVZ", "Carli Du Toit" -> "CDT".
function computeInitials(profile) {
  const first = profile?.name?.[0] || ''
  const surnameInitials = (profile?.surname || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
  return (first + surnameInitials).toUpperCase()
}

export default function ProfileAvatar({ profile, size = 40, className = '', showInitials = true }) {
  const initials = computeInitials(profile)
  const color = profile?.color_code || NEUTRAL_AVATAR_COLOR

  if (profile?.avatar_url) {
    // Ring is 1px thinner than before, with the freed-up space going to a
    // thin canvas-coloured border around the photo — keeps the outer size
    // identical to the no-photo avatar while making the photo read clearly
    // against its own ring instead of blending straight into it.
    const ringWidth = Math.max(2, Math.round(size * 0.12) - 1)
    const photoBorderWidth = Math.max(1, Math.round(size * 0.035))
    const patternStyle = profile?.pattern_type
      ? patternBackgroundStyle(profile.pattern_type, color, Math.max(6, Math.round(size / 8)))
      : null
    return (
      <div
        className={`relative flex-shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size, padding: ringWidth, backgroundColor: color, ...patternStyle }}
      >
        <div
          className="h-full w-full overflow-hidden rounded-full border-canvas-raised"
          style={{ borderWidth: photoBorderWidth }}
        >
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
        fontSize: Math.max(8, Math.round(size * (initials.length > 2 ? 0.24 : 0.32))),
        ...patternStyle,
      }}
    >
      {showInitials ? initials : null}
    </div>
  )
}
