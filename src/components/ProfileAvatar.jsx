import { NEUTRAL_AVATAR_COLOR } from '../lib/color'
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

// Renders a profile's photo, or a white circle with their initials when
// there's no photo, ringed either way by their identity colour + pattern —
// same ring geometry in both cases, so the two only differ in what sits at
// the centre. The ring tiles the pattern at a narrow-band tile size (rather
// than tiling across a whole fill) since it's always just a thin band now.
//
// `soloFill` skips all of that and renders a single circle fully filled with
// colour + pattern instead — used only for the Profile section's tiny blank
// identity marker shown next to a photo thumbnail, which wants a solid swatch
// rather than a ring around mostly-white.
export default function ProfileAvatar({ profile, size = 40, className = '', showInitials = true, soloFill = false }) {
  const color = profile?.color_code || NEUTRAL_AVATAR_COLOR

  if (soloFill) {
    const patternStyle = profile?.pattern_type
      ? patternBackgroundStyle(profile.pattern_type, color, Math.max(8, Math.round(size / 4)))
      : null
    return (
      <div
        className={`flex-shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size, backgroundColor: color, ...patternStyle }}
      />
    )
  }

  const initials = computeInitials(profile)
  const hasPhoto = Boolean(profile?.avatar_url)

  // Ring is 1px thinner than a full fill would need, with the freed-up space
  // going to a thin canvas-coloured border around the inner circle — keeps
  // the outer size identical whether there's a photo or just initials, and
  // keeps the inner circle reading clearly against its own ring instead of
  // blending straight into it.
  const ringWidth = Math.max(2, Math.round(size * 0.12) - 1)
  const innerBorderWidth = Math.max(0.5, Math.round(size * 0.035) - 0.5)
  const patternStyle = profile?.pattern_type
    ? patternBackgroundStyle(profile.pattern_type, color, Math.max(6, Math.round(size / 8)))
    : null

  return (
    <div
      className={`relative flex-shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, padding: ringWidth, backgroundColor: color, ...patternStyle }}
    >
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-canvas-raised bg-canvas-raised font-medium"
        style={{
          borderWidth: innerBorderWidth,
          color: '#0F172A',
          fontSize: Math.max(8, Math.round(size * (initials.length > 2 ? 0.24 : 0.32))),
        }}
      >
        {hasPhoto ? (
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          showInitials ? initials : null
        )}
      </div>
    </div>
  )
}
