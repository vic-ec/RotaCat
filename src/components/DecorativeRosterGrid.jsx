// Purely decorative roster band behind the desktop auth hero's mascot — a
// stylised suggestion of an ED schedule, never real data. Nothing here is
// interactive or announced: the whole layer is aria-hidden and
// pointer-events-none, and the assignment pills carry abstract bars rather
// than text, so there is no name to leak and nothing to un-blur.
//
// The layout is generated once at module load from a seeded generator, not
// per render: the same band every time, no layout shift when the hero
// re-renders, and no randomness that could differ between two viewers.
//
// Shared by both heroes. The width cap mirrors whichever panel it sits in:
// the full viewport less the mobile hero's px-6, or from md up half the
// viewport less the page's px-4, capped at the card's own 40rem half. The
// mask fades the band to nothing at its own edges, so matching the panel is
// what stops the band being cut off mid-fade — against the mint sign-in side
// on desktop, or the screen edge on a phone.
//
// It stops higher above the paws on mobile (42px against 85px) because the
// mascot is smaller there, so the same gap in pixels would read as a much
// larger one.
//
// The band is centred on the cat, which is itself centred in the panel, so
// it sits centred in the white space. Balance comes from the columns rather
// than from offsetting the box: the leading column is drawn at 30% and the
// edge mask fades 26% of the width on the left against 10% on the right, so
// the roster arrives out of nothing on one side and runs on past the cat on
// the other. It reaches 195px past the cat from md up and 80px on a phone.

// Restrained greys only — near-white through pale blue-grey. The roster must
// stay quieter than the mascot, which is the panel's only colour.
const PILL_TONES = ['#F7F8F9', '#F1F3F5', '#EAEDF0', '#E4E8EC', '#DEE3E9']
const BAR_TONE = '#D3D9E0'

const COLUMNS = ['08:00', '12:00', '15:00', '22:00']
const ROWS = 5

// Small deterministic PRNG (mulberry32) so the band is stable across renders.
function seeded(seed) {
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const rand = seeded(20260906)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

// Over half the pills pulse, and the keyframes spend 30% of each cycle doing
// it, so cycles of 5.5-6.7s give a 1.65-2s settle after a 3.9-4.7s wait and
// leave roughly 16% of the band moving at any moment. What makes it visible
// at all is amplitude rather than either of those: these pills sit ~10 levels
// off white, so fading one to full opacity moved it about two levels. It
// darkens as it settles, which is a swing you can see.
const PULSE_SHARE = 0.55

// Three to a cell, everywhere: a cell short of the rest read as a hole in
// the middle of the roster rather than as a quiet shift. Five rows rather
// than six is what pays for it — three pills need 41px and six rows only
// left 37px at 1366x768, so the grid outgrew the band and the bottom row
// was being hidden by the mask rather than fitting.
const PILLS_PER_CELL = 3

const BAND = Array.from({ length: ROWS }, (_, row) => ({
  row,
  cells: COLUMNS.map(() =>
    Array.from({ length: PILLS_PER_CELL }, () => ({
      tone: pick(PILL_TONES),
      bars: Array.from({ length: rand() < 0.45 ? 3 : 2 }, () => 16 + Math.round(rand() * 30)),
      pulse: rand() < PULSE_SHARE,
      // per-pill cycle and start offset, so no two pills settle together
      // and none of them keeps a beat
      duration: `${(5.5 + rand() * 1.2).toFixed(2)}s`,
      delay: `${(rand() * 12).toFixed(2)}s`,
    })),
  ),
}))

function Pill({ pill }) {
  return (
    <div
      className={`flex w-full shrink-0 items-center gap-[3px] rounded-[3px] px-[5px] py-[3px] opacity-80 ${
        pill.pulse ? 'roster-pill-pulse' : ''
      }`}
      style={{
        backgroundColor: pill.tone,
        animationDuration: pill.pulse ? pill.duration : undefined,
        animationDelay: pill.pulse ? pill.delay : undefined,
      }}
    >
      {pill.bars.map((width, i) => (
        <span
          key={i}
          className="h-[3px] rounded-full"
          style={{ width: `${width}%`, backgroundColor: BAR_TONE }}
        />
      ))}
    </div>
  )
}

export default function DecorativeRosterGrid() {
  return (
    <div
      aria-hidden="true"
      className="roster-band-mask pointer-events-none absolute bottom-[42px] left-1/2 top-[2%] -z-10
        w-[calc(100%+160px)] max-w-[calc(100vw-3rem)] -translate-x-1/2 select-none
        md:bottom-[85px] md:w-[calc(100%+390px)] md:max-w-[min(calc(50vw-2rem),40rem)]"
    >
      <div className="flex h-full flex-col pt-[7%] opacity-90">
        <div className="flex border-b border-slate-line/60 pb-[4px]">
          {COLUMNS.map((time, col) => (
            <div
              key={time}
              className={`flex-1 text-center text-[9px] font-medium tracking-wide text-ink-muted/45
                lg:text-[10px] ${col === 0 ? 'opacity-30' : ''}`}
            >
              {time}
            </div>
          ))}
        </div>

        {BAND.map((row) => (
          <div key={row.row} className="flex min-h-0 flex-1 border-b border-slate-hairline last:border-b-0">
            {row.cells.map((cell, col) => (
              <div
                key={col}
                className={`flex min-h-0 flex-1 flex-col gap-[4px] overflow-hidden border-r
                  border-slate-line/60 px-[6px] py-[5px] last:border-r-0
                  ${col === 0 ? 'opacity-30' : ''}`}
              >
                {cell.map((pill, i) => (
                  <Pill key={i} pill={pill} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
