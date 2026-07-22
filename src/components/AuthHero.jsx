import robotLily from '../assets/lily-robot-ginger-full-side-profile-mattshadow.png'
import butterflyLoop from '../assets/butterfly-loop.webp'
import RotaCat from './RotaCat'

// Shared hero/branding panel for the split-screen card layout — used by
// forgot-password/reset-password at all breakpoints, and by login/signup
// on desktop only (they render their own MobileAuthHero below md, with
// this component's whole desktop block hidden by an ancestor wrapper).
export default function AuthHero() {
  return (
    <div className="flex flex-col items-center justify-center bg-canvas-raised px-6 pt-3 pb-3 sm:px-10 md:w-1/2 md:border-r md:border-accent/25 md:px-10 lg:px-[4.375rem] md:py-20">
      <h1 className="font-display text-6xl font-medium leading-none text-ink md:text-[75px]">
        <RotaCat />
      </h1>
      <p className="mt-3 whitespace-nowrap text-sm text-ink-muted sm:text-base md:text-lg md:mt-[15px] lg:text-[22px]">
        Smart ED scheduling, made{' '}
        <span className="relative inline-block">
          effortless
          <img
            src={butterflyLoop}
            alt=""
            className="absolute -top-[11px] -right-[9px] h-5 w-5 -rotate-8 select-none"
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
    </div>
  )
}
