import rotacatMascot from '../assets/rotacat-half-body-mascot.png'
import butterflyLoop from '../assets/butterfly-loop.webp'
import RotaCat from './RotaCat'

// Full-bleed hero for the mobile auth layout — fills whatever space is left
// above the bottom sheet (via flex-1 from the parent column), no border or
// background padding around it. Desktop uses AuthHero instead.
export default function MobileAuthHero() {
  return (
    <div className="flex flex-1 -translate-y-[5px] flex-col items-center justify-center bg-canvas-raised px-6">
      <h1 className="font-serif text-[66px] font-semibold leading-none text-ink">
        <RotaCat />
      </h1>
      <p className="mt-2 whitespace-nowrap text-[14.7px] text-ink-muted">
        Smart ED scheduling, made{' '}
        <span className="relative inline-block">
          effortless
          <img
            src={butterflyLoop}
            alt=""
            className="absolute -top-[16px] -right-[14px] h-[27px] w-[27px] -rotate-8 select-none"
            draggable="false"
          />
        </span>
      </p>

      {/* Half-body mascot. Sized by height, like the sheet below it, so the
          taller portrait crop can never push the sign-in card off a short
          phone: the dvh term wins on small screens, the px cap on tall ones
          (~220px wide at the cap, ~270px from `sm` up). Deliberately left
          unraised (no z-index) so the sheet's rounded top edge, which
          overlaps this hero by 28px, covers the artwork's flat bottom crop
          and the cat reads as sitting on the mint panel. alt="" is also
          deliberate — the wordmark and tagline above already carry
          everything the image says. */}
      <img
        src={rotacatMascot}
        alt=""
        className="mt-2 h-[min(345px,40dvh)] w-auto translate-y-[5px] select-none object-contain sm:h-[min(420px,44dvh)]"
        draggable="false"
      />
    </div>
  )
}
