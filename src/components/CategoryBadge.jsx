// Solid teal circle badge (brand accent #0F766E, white border, white
// letters) used everywhere a leave-planner grid marks which staff category
// a doctor belongs to. Replaces the old per-category coloured dots
// (COLUMN_DOT_COLOR) — every category now renders in the same colour, so it
// can never be mistaken for the Annual planner's capacity heat map
// (available/limited/near/at-capacity), which is the only place colour
// still carries planner-specific meaning. Category identity lives entirely
// in the letter now.
//
// Hardcodes the app's real accent hex (#0F766E) rather than a Tailwind
// class/CSS var — this badge represents the product's own fixed-light UI,
// so it must render identically regardless of the (currently unused,
// unwired) dark theme tokens living elsewhere in tailwind.config.js.
const FONT_SIZE_BY_LENGTH = { 1: 17, 2: 14, 3: 12.5 }

export default function CategoryBadge({ label, size = 20, className = '' }) {
  const fontSize = FONT_SIZE_BY_LENGTH[label.length] ?? 12.5
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <circle cx="22" cy="22" r="21" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <circle cx="22" cy="22" r="18.5" fill="#0F766E" />
      <text
        x="22" y="23" fontSize={fontSize} fontWeight="700" fill="#FFFFFF"
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
// possible.
export function CategoryOverflowChip({ count, size = 16 }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.5)), background: '#0F766E', border: '1.5px solid rgba(255,255,255,0.55)' }}
    >
      +{count}
    </span>
  )
}
