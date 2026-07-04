import robotLily from '../assets/lily-robot-ginger.png'

function Butterfly({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 6c-1-3-6-4-7-1-1 2.5 1.5 4.5 4 4.5" stroke="#0E7C6B" strokeWidth="1.4" fill="#0E7C6B" fillOpacity="0.45" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 6c1-3 6-4 7-1 1 2.5-1.5 4.5-4 4.5" stroke="#D6577E" strokeWidth="1.4" fill="#D6577E" fillOpacity="0.45" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8c-1 2.5-5 3.5-5.5 1-.4-2 2-3.2 4-2.3" stroke="#0E7C6B" strokeWidth="1.2" fill="#0E7C6B" fillOpacity="0.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8c1 2.5 5 3.5 5.5 1 .4-2-2-3.2-4-2.3" stroke="#D6577E" strokeWidth="1.2" fill="#D6577E" fillOpacity="0.3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="5.5" x2="12" y2="13" stroke="#0F172A" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

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
          <Butterfly className="absolute -top-[13px] -right-1 h-6 w-6 -rotate-12" />
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
