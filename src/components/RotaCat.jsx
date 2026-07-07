// Single source of truth for the "RotaCat" wordmark's two-tone styling.
// Anywhere the app name is displayed, import this instead of typing
// "RotaCat" as plain text, so the teal "Cat" can't drift out of sync.
import butterflyImg from '../assets/butterfly-v3.png'

export default function RotaCat({ className }) {
  return (
    <span className={className}>
      Rota{' '}
      <span className="text-accent">
        <span className="relative inline-block">
          Cat
          <img
            src={butterflyImg}
            alt=""
            className="absolute -top-[10px] -right-4 h-7 w-7 -rotate-12 select-none"
            draggable="false"
          />
        </span>
      </span>
    </span>
  )
}
