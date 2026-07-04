import robotLily from '../assets/lily-robot-ginger.png'
import butterflyImg from '../assets/butterfly-realistic.png'

// Named export — used by page titles that also need "Cat" in teal
// (e.g. "Sign in to your RotaCat account", if that copy comes back later)
export function RotaCat({ className }) {
  return (
    <span className={className}>
      Rota<span className="text-accent">Cat</span>
    </span>
  )
}

// Shared hero/branding panel — identical on login and signup by construction,
// not by two people remembering to keep two copies in sync.
export default function AuthHero() {
  return (
    <div className="flex flex-col items-center justify-center bg-accent-tint px-6 py-[4.375rem] sm:px-10 md:w-1/2 md:border-r md:border-accent/25 md:px-[4.375rem] md:py-20">
      <h1 className="font-display text-6xl font-medium leading-none text-ink md:text-[75px]">
        <RotaCat />
      </h1>
      <p className="mt-[15px] whitespace-nowrap text-sm text-ink-muted sm:text-lg md:text-[22px]">
        the smarter play in EC{' '}
        <span className="relative inline-block">
          rostering
          <img
            src={butterflyImg}
            alt=""
            className="absolute -top-[13px] -right-5 h-6 w-6 -rotate-12 select-none"
            draggable="false"
          />
        </span>
      </p>

      <img
        src={robotLily}
        alt=""
        className="mt-10 h-[280px] w-auto select-none md:h-80"
        draggable="false"
      />
    </div>
  )
}
