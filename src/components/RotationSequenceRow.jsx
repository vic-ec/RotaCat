import { monthlyTypeKeys } from '../lib/internRotations'
import { rotationTypeLabel, rotationTypeCode, ROTATION_TYPE_COLOR } from '../lib/staffDefaults'
import { MONTH_ABBR } from '../lib/dateRange'

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

// Blend a rotation colour toward white for the current-month spotlight —
// a lighter fill reads more clearly than a thicker ring, and unlike a
// fixed accent tint it works for every rotation colour. Dark text (set
// alongside it below) stays theme-independent too, since the blended
// colour is a fixed hex either way, not a theme token.
function lightenHex(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = c => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// Mobile's compact month header — single letters, not the full "Jan Feb…"
// abbreviations desktop's own grid header keeps. Rendered as a plain row;
// the caller nests it inside its own already-sticky toolbar/year header
// (so it inherits that positioning instead of guessing a pixel offset to
// stick itself at). `px-4` matches the row buttons' own internal padding
// below (RotationSequenceRow's mobile layout), on top of whatever ambient
// page padding the sticky wrapper already restores — without it the
// letters sit a row-padding's width off from the cells they label.
export function MonthLetterHeader({ year, currentYear }) {
  return (
    <div className="flex gap-[2px] border-t border-slate-line px-4 pt-1.5">
      {MONTH_LETTERS.map((letter, i) => (
        <span
          key={i}
          className={`flex-1 text-center text-[10px] font-semibold uppercase ${
            year === currentYear && i === new Date().getMonth() ? 'text-accent' : 'text-ink-muted'
          }`}
        >
          {letter}
        </span>
      ))}
    </div>
  )
}

// A neutral (non rotation-type) chip — "Between blocks", "Starts 1 Jan",
// "Finished 31 Aug"… — same pill shape the rotation-type chip uses, just
// without a type colour, so the two never compete for attention as two
// different shapes.
function Chip({ tone, color, children }) {
  return (
    <span
      className={`flex-shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        tone === 'type' ? 'text-white' : 'border border-slate-line text-ink-light'
      }`}
      style={tone === 'type' ? { backgroundColor: color } : undefined}
    >
      {children}
    </span>
  )
}

// The 12 month cells, shared pixel-for-pixel between desktop's grid
// columns and mobile's flex row — each cell is its own coloured box with
// its rotation's code centred in it, or an empty sunken box for a real
// gap. `heightClassName` is the only thing that differs by breakpoint.
function MonthCells({ doctorRotations, year, showCurrentMonthHalo, heightClassName }) {
  const keys = monthlyTypeKeys(doctorRotations, year)
  const currentMonthIndex = showCurrentMonthHalo ? new Date().getMonth() : -1
  return keys.map((key, i) => {
    const isCurrent = i === currentMonthIndex
    return (
      <div
        key={i}
        title={key ? `${MONTH_ABBR[i]}: ${rotationTypeLabel(key)}` : `${MONTH_ABBR[i]}: no rotation`}
        className={`flex flex-1 items-center justify-center rounded text-[11px] font-semibold ${heightClassName} ${
          key ? (isCurrent ? '' : 'text-white') : 'bg-canvas-sunken'
        } ${isCurrent ? 'border-2 border-accent' : ''}`}
        style={{
          backgroundColor: key ? (isCurrent ? lightenHex(ROTATION_TYPE_COLOR[key], 0.5) : ROTATION_TYPE_COLOR[key]) : undefined,
          color: key && isCurrent ? '#1F2937' : undefined,
        }}
      >
        {key ? rotationTypeCode(key) : ''}
      </div>
    )
  })
}

// The one row every tab (Active/Upcoming/Completed) and both breakpoints
// build on — a doctor's whole year of rotations in sequence, replacing the
// old per-rotation spanning bars (desktop) and covered-months strip
// (mobile). The whole row is one button that selects the doctor, exactly
// as a matrix row or a planner card did before.
//
// `chip`/`positionLine` are supplied by the caller (RotationSequenceRow
// has no opinion on Active vs Upcoming vs Completed copy — see
// activeRotationStatus/upcomingRotationStatus/completedRotationStatus in
// internRotations.js and each tab's own formatting function).
//
// `layout`: 'desktop' renders as a CSS grid row (label column + 12 month
// columns) meant to sit inside a parent sharing the same
// `gridTemplateColumns`, so it stays pixel-aligned with the sticky month
// header above it. 'mobile' renders as a flat, self-contained row with a
// hairline divider below it — no grid, no sticky name column.
export default function RotationSequenceRow({
  doctor, label, rotations, year, currentYear, showCurrentMonthHalo = false,
  chip, positionLine, isSelected, onSelect, layout, gridTemplateColumns,
}) {
  const titleAttr = `${doctor.name || ''} ${doctor.surname}`.trim()

  if (layout === 'desktop') {
    return (
      <div
        onClick={onSelect}
        aria-selected={isSelected}
        className={`group grid cursor-pointer border-t border-slate-hairline transition-colors ${
          isSelected ? 'bg-accent-tint shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : 'hover:bg-canvas-cool'
        }`}
        style={{ gridTemplateColumns }}
      >
        <div className={`sticky left-0 z-10 flex min-w-0 flex-col justify-center gap-1 border-r border-slate-line px-3 py-1.5 transition-colors ${
          isSelected ? 'bg-accent-tint shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : 'bg-canvas group-hover:bg-canvas-cool'
        }`}>
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              title={titleAttr}
              className={`min-w-0 flex-shrink truncate text-left text-sm font-medium ${isSelected ? 'text-accent' : 'text-ink'}`}
            >
              {label}
            </button>
            {chip && <Chip tone={chip.tone} color={chip.color}>{chip.text}</Chip>}
          </div>
          <p className="truncate text-[10px] text-ink-muted" title={positionLine}>{positionLine}</p>
        </div>
        <MonthCells
          doctorRotations={rotations}
          year={year}
          showCurrentMonthHalo={showCurrentMonthHalo && year === currentYear}
          heightClassName="h-[22px] self-center mx-[1px]"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-selected={isSelected}
      className={`block w-full border-b border-slate-hairline px-4 py-2.5 text-left transition-colors ${
        isSelected ? 'bg-accent-tint' : 'hover:bg-canvas-cool'
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span title={titleAttr} className={`min-w-0 flex-shrink truncate text-sm font-medium ${isSelected ? 'text-accent' : 'text-ink'}`}>
          {label}
        </span>
        {chip && <Chip tone={chip.tone} color={chip.color}>{chip.text}</Chip>}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        <MonthCells
          doctorRotations={rotations}
          year={year}
          showCurrentMonthHalo={showCurrentMonthHalo && year === currentYear}
          heightClassName="h-[26px]"
        />
      </div>
      <p className="mt-1.5 truncate text-xs text-ink-muted">{positionLine}</p>
    </button>
  )
}
