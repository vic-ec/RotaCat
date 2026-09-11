import DecorativeRosterGrid from './DecorativeRosterGrid'
import RotaCat from './RotaCat'
import { useAuthMascot } from '../lib/useAuthMascot'

// Shared hero/branding panel for the split-screen card layout — used by
// reset-password at all breakpoints, and by login/signup on desktop only
// (they render their own MobileAuthHero below md, with this component's
// whole desktop block hidden by an ancestor wrapper). Forgot Password is
// no longer its own page — it's a modal on /login (LoginPage.jsx's
// ForgotPasswordModal), so it doesn't render this at all.
//
// The mascot here is the transparent cut-out, not the flat asset the mobile
// hero uses: this panel draws its roster band in the DOM (so pills can
// pulse), and an opaque mascot would hide it. `isolate` on the panel gives
// the band a stacking context to sit behind the cat in, and `overflow-hidden`
// keeps it from spilling past the panel's edge into the sign-in side.
export default function AuthHero() {
  const rotacatMascot = useAuthMascot()

  return (
    <div className="relative isolate flex -translate-y-[5px] flex-col items-center justify-center overflow-hidden bg-auth-hero px-6 pt-3 pb-3 sm:px-10 md:w-1/2 md:border-r md:border-accent/25 md:px-10 lg:px-[4.375rem] md:py-[5.75rem]">
      <h1 className="font-serif text-6xl font-semibold leading-none text-ink md:text-[82.5px]">
        <RotaCat />
      </h1>
      <p className="mt-3 whitespace-nowrap text-[14.7px] text-ink-muted sm:text-[16.8px] md:text-[18.9px] md:mt-[15px] lg:text-[23.1px]">
        Smart ED scheduling, made effortless
      </p>

      {/* w-fit so the wrapper hugs the mascot: the roster band is sized and
          positioned against the cat's own box, which is what lets it reach a
          fixed distance either side of the silhouette and stop a fixed
          distance above the paws. It deliberately does not clip — the panel
          above does that, once the band has already faded out. */}
      <div className="relative isolate mt-3 flex w-fit justify-center md:mt-[15px]">
        <DecorativeRosterGrid />

        {/* Full-body mascot, centred under the wordmark with the panel's own
            py-[5.75rem] as the whitespace below it. Sized by height rather
            than width because this canvas is ~2x taller than wide: the vh
            term keeps the whole branding column (wordmark + tagline + cat +
            padding) inside a 768px-tall laptop without clipping, and the px
            cap stops it ballooning on tall displays. The 260px floor is for
            landscape phones and tablets: there 45vh collapses the cat to
            ~150px even though the card, whose height the sign-in form sets,
            has room for far more. alt="" is deliberate: the wordmark and
            tagline beside it already carry the same meaning. */}
        <img
          src={rotacatMascot}
          alt=""
          className="relative z-10 h-[min(250px,30dvh)] w-auto max-w-full translate-y-[5px] select-none object-contain md:h-[clamp(260px,45vh,430px)]"
          draggable="false"
        />
      </div>
    </div>
  )
}
