import robotLily from '../assets/lily-robot-ginger-mirrorshadow-nobg.png'
import butterflyImg from '../assets/butterfly-v3.png'
import RotaCat from './RotaCat'

// Shared hero/branding panel — identical on login and signup by construction,
// not by two people remembering to keep two copies in sync.
export default function AuthHero() {
  return (
    <div className="flex flex-col items-center justify-center bg-canvas-raised px-6 py-[4.375rem] sm:px-10 md:w-1/2 md:border-r md:border-accent/25 md:px-10 lg:px-[4.375rem] md:py-20">
      <h1 className="font-display text-6xl font-medium leading-none text-ink md:text-[75px]">
        <RotaCat />
      </h1>
      <p className="mt-[15px] whitespace-nowrap text-sm text-ink-muted sm:text-base md:text-lg lg:text-[22px]">
        Smart ED scheduling, made{' '}
        <span className="relative inline-block">
          effortless
          <img
            src={butterflyImg}
            alt=""
            className="absolute -top-[17px] -right-5 h-7 w-7 -rotate-12 select-none"
            draggable="false"
          />
        </span>
      </p>

      <div className="relative mt-10">
        <img
          src={robotLily}
          alt=""
          className="relative z-10 h-[280px] w-auto select-none md:h-80"
          draggable="false"
        />
        {/* CSS-drawn contact shadow — deliberate and controllable,
            not dependent on extracting a faint shadow from the source photo */}
        <div
          className="absolute bottom-1 left-1/2 h-4 w-32 -translate-x-1/2 rounded-full bg-ink/20 blur-md md:h-5 md:w-40"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}
