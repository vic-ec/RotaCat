// Circle badge marking which staff category a doctor belongs to, used
// everywhere a leave-planner grid lists people. Category identity lives
// entirely in the letter — never in the colour — so the badge defaults to
// one neutral slate for every category and can't be read as a status.
//
// `fill` is the one exception, and only the month-view planner grids pass
// it. There, the badge doubles as the day's capacity signal: the cells used
// to carry that as a full-bleed background, which on any theme reads as a
// wall of colour and forces every name in the cell to stay legible against
// four different grounds. Colouring the badges instead puts the signal on
// the thing you are already looking at — one doctor out is yellow, two
// orange, three red — and leaves the cell itself alone. The letter is still
// what says MO or Reg; the colour only ever says how full the day is.
//
// The neutral fill is a fixed hex rather than a token: it is the same slate
// in both themes, and white letters on it clear 7:1 either way.
const FONT_SIZE_BY_LENGTH = { 1: 17, 2: 14, 3: 12.5 }
const NEUTRAL_FILL = '#4B5563'

// The badge's outer ring is the surface it sits on, not a literal white —
// on the dark theme a white ring around a small circle reads as a bright
// dot before it reads as a badge.
const RING = 'rgb(var(--color-canvas-raised))'

export default function CategoryBadge({ label, size = 20, className = '', fill = NEUTRAL_FILL }) {
  const fontSize = FONT_SIZE_BY_LENGTH[label.length] ?? 12.5
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* One circle with both fill and stroke, not a filled circle plus a
          separate outer stroke-only ring — SVG centres a stroke on the
          path itself, so it sits flush against the fill with no gap
          between them. Two disconnected circles left an unfilled band
          between the fill's edge and the ring that showed through to
          whatever was behind the badge. Stroke is fully opaque — a
          translucent one let the fill show through, reading as a muted
          border instead of a crisp one. */}
      <circle cx="22" cy="22" r="19" fill={fill} stroke={RING} strokeWidth="1" />
      <text
        x="22" y="22" fontSize={fontSize} fontWeight="700" fill="#FFFFFF"
        textAnchor="middle" dominantBaseline="central" fontFamily="inherit"
      >
        {label}
      </text>
    </svg>
  )
}

// A day cell showing every category present at once (the mobile month
// glance, the mobile day cell) only has room for 4 badges before it stops
// being readable — shows the first 3 plus a "+N" chip for the rest rather
// than shrinking every badge to fit all 5. Consultant is uncapped, so a
// 5-category day (all 4 capacity columns plus Consultant) is rare but
// possible. Takes the same `fill` as the badges it stands in for, so a
// capacity-coloured row doesn't end on a neutral chip.
export function CategoryOverflowChip({ count, size = 16, fill = NEUTRAL_FILL }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(7, Math.round(size * 0.5)),
        background: fill,
        border: `1px solid ${RING}`,
      }}
    >
      +{count}
    </span>
  )
}
