import robotLily from '../assets/lily-robot-ginger-full-side-profile-mattshadow.png'
import butterflyLoop from '../assets/butterfly-loop.webp'
import RotaCat from './RotaCat'

// Full-bleed hero for the mobile auth layout — fills whatever space is left
// above the bottom sheet (via flex-1 from the parent column), no border or
// background padding around it. Desktop uses AuthHero instead.
export default function MobileAuthHero() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-canvas-raised px-6">
      <h1 className="font-display text-6xl font-medium leading-none text-ink">
        <RotaCat />
      </h1>
      <p className="mt-4 whitespace-nowrap text-sm text-ink-muted">
        Smart ED scheduling, made{' '}
        <span className="relative inline-block">
          effortless
          <img
            src={butterflyLoop}
            alt=""
            className="absolute -top-[11px] -right-[16px] h-5 w-5 -rotate-10 select-none"
            draggable="false"
          />
        </span>
      </p>

      <div className="relative mt-6">
        <img
          src={robotLily}
          alt=""
          className="relative z-10 h-[189px] w-auto select-none"
          draggable="false"
        />
      </div>
    </div>
  )
}
