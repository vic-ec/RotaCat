// Copyright line shown at the bottom of every unauthenticated auth screen.
// `onLight` switches to dark secondary text (`ink-light`, 7.6:1 on white)
// for use on a light panel or the mobile bottom sheet; the default
// (on-fill/70) is for the desktop accent background, which is teal in the
// light theme and near-black in the dark one -- hence the token rather
// than a literal white. `topGap` lets a caller match this line's
// margin-top to its own bottom padding, so the space above and below the
// footer line reads as equal instead of defaulting to a small fixed gap.
// `compact` drops the size below the usual text-xs, for pages where it
// should read as quieter than nearby helper text (e.g. "Already have an
// account?"). The login page leaves it off: 12px is the floor the
// redesign sets for this line.
export default function AuthFooter({ onLight = false, topGap = 'mt-3', compact = false }) {
  return (
    <p className={`${topGap} text-center ${compact ? 'text-[10px]' : 'text-xs'} ${onLight ? 'text-ink-light' : 'text-on-fill/70'}`}>
      © {new Date().getFullYear()} vic-ec. All rights reserved.
    </p>
  )
}
