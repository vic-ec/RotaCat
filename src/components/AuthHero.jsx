import rotacatMascot from '../assets/rotacat-full-body-mascot.png'
import butterflyLoop from '../assets/butterfly-loop.webp'
import RotaCat from './RotaCat'

// Shared hero/branding panel for the split-screen card layout — used by
// reset-password at all breakpoints, and by login/signup on desktop only
// (they render their own MobileAuthHero below md, with this component's
// whole desktop block hidden by an ancestor wrapper). Forgot Password is
// no longer its own page — it's a modal on /login (LoginPage.jsx's
// ForgotPasswordModal), so it doesn't render this at all.
export default function AuthHero() {
  return (
    <div className="flex -translate-y-[5px] flex-col items-center justify-center bg-canvas-raised px-6 pt-3 pb-3 sm:px-10 md:w-1/2 md:border-r md:border-accent/25 md:px-10 lg:px-[4.375rem] md:py-[5.75rem]">
      <h1 className="font-serif text-6xl font-semibold leading-none text-ink md:text-[82.5px]">
        <RotaCat />
      </h1>
      <p className="mt-3 whitespace-nowrap text-[14.7px] text-ink-muted sm:text-[16.8px] md:text-[18.9px] md:mt-[15px] lg:text-[23.1px]">
        Smart ED scheduling, made{' '}
        <span className="relative inline-block">
          effortless
          <img
            src={butterflyLoop}
            alt=""
            className="absolute -top-[18px] -right-[14.5px] h-[34px] w-[34px] -rotate-8 select-none"
            draggable="false"
          />
        </span>
      </p>

      {/* Full-body mascot, centred under the wordmark with the panel's own
          py-[5.75rem] as the whitespace below it. Sized by height rather
          than width because this canvas is ~1.6x taller than wide: the vh
          term keeps the whole branding column (wordmark + tagline + cat +
          padding) inside a 768px-tall laptop without clipping, and the px
          cap stops it ballooning on tall displays — roughly 230px wide at
          1366x768, 275px at the cap. alt="" is deliberate: the wordmark and
          tagline beside it already carry the same meaning. */}
      <img
        src={rotacatMascot}
        alt=""
        className="mt-3 h-[min(250px,30dvh)] w-auto translate-y-[5px] select-none object-contain md:mt-[15px] md:h-[min(430px,45vh)]"
        draggable="false"
      />
    </div>
  )
}
