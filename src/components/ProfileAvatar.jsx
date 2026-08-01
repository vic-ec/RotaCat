import { useEffect, useRef, useState } from 'react'
import { NEUTRAL_AVATAR_COLOR, mutedAvatarColor, placeholderAvatarColor } from '../lib/color'
import { patternBackgroundStyle } from '../lib/avatarPatterns'

// Small inline status indicator, meant to sit next to a name/surname (not on
// the avatar itself) — a plain colored dot: green (active), red (inactive),
// or yellow (active but currently on approved leave — a dedicated
// statusAway yellow, not the flag* palette, so it doesn't read as a
// roster-state flag or as another shade of the green "active" dot).
// Inactive takes priority over on-leave since it's the more permanent state.
export function StatusBadge({ active, onLeave, size = 16, className = '' }) {
  const colorClass = !active ? 'bg-flagRed' : onLeave ? 'bg-statusAway' : 'bg-success'
  const label = !active ? 'Inactive' : onLeave ? 'On leave' : 'Active'
  return (
    <span
      className={`inline-flex flex-shrink-0 rounded-full ${colorClass} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      title={label}
    />
  )
}

// Corner status badge for an avatar, with an optional click-to-change menu.
// `interactive` is only ever true for the logged-in user's own avatar — every
// other instance (viewing someone else) renders the plain, non-clickable
// StatusBadge. Only Active/Inactive are settable here; "On leave" is derived
// from actual approved leave records for the current date, not a simple
// flag, so it isn't offered as a pickable option — it's shown as an
// informational line instead, and only while that leave period is current.
export function StatusPicker({ active, onLeave, size = 16, interactive = false, onSetActive }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const offset = -Math.round(size * 0.15)
  const badge = <StatusBadge active={active} onLeave={onLeave} size={size} className="border-[1.5px] border-white" />

  // `flex` (not the default inline/block) on every wrapper here: a plain
  // span/button around an inline-flex child sizes to its *line box*, not the
  // child's actual box — with this button's inherited line-height that added
  // ~24px of invisible height around a 12-14px badge, pushing the visible
  // dot up and away from the true bottom-right corner it's meant to hug.
  // The negative offset lets the badge hang slightly outside the avatar's
  // edge (like Teams/Outlook's presence badge) rather than sitting flush
  // inside the corner.
  if (!interactive || !onSetActive) {
    return <span className="absolute flex" style={{ bottom: offset, right: offset }}>{badge}</span>
  }

  return (
    <div ref={ref} className="absolute flex" style={{ bottom: offset, right: offset }}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change your status"
        className="flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {badge}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-lg border border-slate-line bg-canvas-raised py-1 shadow-raised"
        >
          <button
            type="button"
            role="menuitem"
            onClick={e => { e.stopPropagation(); onSetActive(true); setOpen(false) }}
            className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken ${active ? 'font-semibold text-success' : 'text-ink'}`}
          >
            Active
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={e => { e.stopPropagation(); onSetActive(false); setOpen(false) }}
            className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken ${!active ? 'font-semibold text-flagRed' : 'text-ink'}`}
          >
            Inactive
          </button>
          {active && onLeave && (
            <p className="mt-1 flex items-center gap-1.5 border-t border-slate-line px-3 pt-1.5 text-xs font-semibold text-statusAway">
              <StatusBadge active onLeave size={8} /> On leave
            </p>
          )}
        </div>
      )}
    </div>
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
// there's no photo — filled with a muted (desaturated) tone derived from
// their identity colour, initials in white on top. A photo simply fills the
// circle instead.
//
// `ring` restores the old thin colour+pattern ring around a white centre —
// used only by the Account Settings "Appearance" picker, where the vivid,
// un-muted colour/pattern needs to stay visible as the thing being edited.
export default function ProfileAvatar({ profile, size = 40, className = '', showInitials = true, ring = false }) {
  const color = profile?.color_code || NEUTRAL_AVATAR_COLOR
  const initials = computeInitials(profile)
  const hasPhoto = Boolean(profile?.avatar_url)

  if (ring) {
    // Ring is 1px thinner than a full fill would need, with the freed-up space
    // going to a thin canvas-coloured border around the inner circle — keeps
    // the outer size identical whether there's a photo or just initials, and
    // keeps the inner circle reading clearly against its own ring instead of
    // blending straight into it.
    const ringWidth = Math.max(2, Math.round(size * 0.12) - 1)
    const innerBorderWidth = 0.5
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

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-white ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: hasPhoto ? mutedAvatarColor(color) : placeholderAvatarColor(profile?.id),
        fontSize: Math.max(8, Math.round(size * (initials.length > 2 ? 0.24 : 0.32))),
      }}
    >
      {hasPhoto ? (
        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        showInitials ? initials : null
      )}
    </div>
  )
}
