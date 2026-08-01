import robotLily from '../assets/lily-robot-ginger-full-side-profile-mattshadow.png'
import butterflyLoop from '../assets/butterfly-loop.webp'
import RotaCat from './RotaCat'

// Shared hero/branding panel for the split-screen card layout — used by
// forgot-password/reset-password at all breakpoints, and by login/signup
// on desktop only (they render their own MobileAuthHero below md, with
// this component's whole desktop block hidden by an ancestor wrapper).
export default function AuthHero() {
  return (
    <div className="flex flex-col items-center justify-center bg-canvas-raised px-6 pt-3 pb-3 sm:px-10 md:w-1/2 md:border-r md:border-accent/25 md:px-10 lg:px-[4.375rem] md:py-[5.75rem]">
      <h1 className="font-serif text-6xl font-semibold leading-none text-ink md:text-[75px]">
        <RotaCat />
      </h1>
      <p className="mt-3 whitespace-nowrap text-[14.7px] text-ink-muted sm:text-[16.8px] md:text-[18.9px] md:mt-[15px] lg:text-[23.1px]">
        Smart ED scheduling, made{' '}
        <span className="relative inline-block">
          effortless
          <img
            src={butterflyLoop}
            alt=""
            className="absolute -top-[11.5px] -right-[10.5px] h-[22px] w-[22px] -rotate-8 select-none"
            draggable="false"
          />
        </span>
      </p>

      <div className="relative mt-3 md:mt-10">
        <img
          src={robotLily}
          alt=""
          className="relative z-10 h-[176px] w-auto select-none md:h-[296px]"
          draggable="false"
        />
      </div>

      {/* Smaller and lighter than the tagline above — a supporting line,
          not a second headline. */}
      <p className="mt-2 max-w-[220px] text-center text-xs text-ink-muted/70 sm:text-[13px] md:mt-4 md:max-w-[260px] md:text-sm">
        Build fair rotas, manage leave, and keep every shift covered.
      </p>
    </div>
  )
}
