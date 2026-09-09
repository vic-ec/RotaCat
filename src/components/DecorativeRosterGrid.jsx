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
// The bottom edge is a share of the mascot's box from md up rather than a
// fixed inset, which is what keeps it at the phone's level over the front
// legs as the cat grows: 16% lands it ~17% of the cat's height above the
// paws at every width, against the phone's 17.4%. As a fixed px it drifted,
// reading much lower on a tall desktop cat than on a phone. The top edge is
// the same 2% either way.
//
// The band is centred on the cat, which is itself centred in the panel, so
// it sits centred in the white space. The edge mask fades a symmetric 10% of
// the width on each side and nothing fades inside that: a longer fade, or an
// opacity on the leading column, washed the first column out well inside the
// band rather than at its edge.
//
// From md up it is sized against the tagline rather than the cat: 437px is
// the tagline's own width, so the band's edges sit level with the ends of
// the text. Sized off the cat it drifted with the mascot — 17px past the
// tagline on a landscape phone against 84px on a desktop — because the cat
// is height-sized and the tagline is not. The cap keeps 30px a side clear of
// the panel, which is what stops the grid running flush to the panel's edge
// on the narrower widths where the cap, not the 437, decides. A phone in
// portrait keeps its own width, which already looked right.

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

// Two or three to a cell — never one, which read as a hole in the middle of
// the roster. Five rows rather than six is what pays for it: six left only
// 37px of row at 1366x768 and the grid outgrew the band, with the surplus
// hidden by the mask rather than fitting.
//
// A third pill needs 45px of row once the cell's padding is counted, and the
// row is a fifth of a band that is itself a share of the cat, which is sized
// against the viewport's height. So the third is drawn only where the height
// is there for it: the split layout on a viewport at least 800px tall. Below
// that — every phone in portrait, every phone in landscape, a short desktop
// window — it landed part-clipped on the row line rather than reading as a
// pill, so those sizes show two.

const BAND = Array.from({ length: ROWS }, (_, row) => ({
  row,
  cells: COLUMNS.map(() =>
    Array.from({ length: 2 + Math.floor(rand() * 2) }, () => ({
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

const THIRD_PILL = 'max-md:hidden [@media(max-height:799px)]:hidden'

function Pill({ pill, className = '' }) {
  return (
    <div
      className={`flex w-full shrink-0 items-center gap-[3px] rounded-[3px] px-[5px] py-[3px] opacity-80 ${
        pill.pulse ? 'roster-pill-pulse' : ''
      } ${className}`}
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
        md:bottom-[16%] md:w-[437px] md:max-w-[min(calc(50vw-2rem-60px),40rem)]"
    >
      <div className="flex h-full flex-col pt-[7%] opacity-90">
        <div className="flex border-b border-slate-line/60 pb-[4px]">
          {COLUMNS.map((time) => (
            <div
              key={time}
              className="flex-1 text-center text-[9px] font-medium tracking-wide text-ink-muted/45 lg:text-[10px]"
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
                className="flex min-h-0 flex-1 flex-col gap-[4px] overflow-hidden border-r
                  border-slate-line/60 px-[6px] py-[5px] last:border-r-0"
              >
                {cell.map((pill, i) => (
                  <Pill
                    key={i}
                    pill={pill}
                    // the third is drawn only where the row has the 45px it needs
                    className={i === 2 ? THIRD_PILL : ''}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
