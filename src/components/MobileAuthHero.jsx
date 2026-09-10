import DecorativeRosterGrid from './DecorativeRosterGrid'
import RotaCat from './RotaCat'
import { useAuthMascot } from '../lib/useAuthMascot'

// Full-bleed hero for the mobile auth layout — fills whatever space is left
// above the bottom sheet (via flex-1 from the parent column), no border or
// background padding around it. Desktop uses AuthHero instead.
//
// Like the desktop hero, this draws its roster band in the DOM rather than
// relying on one baked into the mascot, which is why it uses the transparent
// cut-out: an opaque mascot would hide the band behind it.
export default function MobileAuthHero() {
  const rotacatMascot = useAuthMascot()

  return (
    <div className="flex flex-1 -translate-y-[5px] flex-col items-center justify-center bg-canvas-raised px-6">
      <h1 className="font-serif text-[66px] font-semibold leading-none text-ink">
        <RotaCat />
      </h1>
      <p className="mt-2 whitespace-nowrap text-[14.7px] text-ink-muted">
        Smart ED scheduling, made effortless
      </p>

      {/* w-fit so the wrapper hugs the mascot and the band can be sized and
          positioned against the cat's own box. The 44px bottom margin is the
          paw clearance the previous artwork carried inside its canvas: this
          cut-out ends at the paws, and the sheet overlaps the hero's last
          28px, so without it the sheet would cover them.

          Below 440px of viewport height — a phone held landscape — the whole
          thing steps out: the sheet plus that 28px leaves so little that any
          cat big enough to see would be clipped, and the wordmark carries the
          hero on its own. */}
      <div className="relative isolate mt-2 mb-[24px] flex w-fit justify-center [@media(max-height:440px)]:hidden">
        <DecorativeRosterGrid />

        {/* Sized by height, like the sheet below it, so the tall portrait
            canvas can never push the sign-in card off a short phone: the dvh
            term wins on small screens, the px cap on tall ones. Below 640px of
            viewport height the sheet's fixed 44dvh leaves too little room, so
            the cat steps down a size.

            Every height here is the old flat asset's times 0.792, which is how
            much of that canvas was actually cat. Swapping in a cut-out at the
            same CSS height silently grew the cat by a quarter and pushed the
            wordmark into the top of the screen; these numbers put it back where
            it was. alt="" is deliberate — the wordmark and tagline above
            already carry everything the image says. */}
        <img
          src={rotacatMascot}
          alt=""
          className="relative z-10 h-[min(273px,32dvh)] w-auto max-w-full translate-y-[5px] select-none object-contain [@media(max-height:640px)]:h-[min(158px,27dvh)] sm:h-[min(333px,35dvh)]"
          draggable="false"
        />
      </div>
    </div>
  )
}
