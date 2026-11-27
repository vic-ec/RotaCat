// WhatsApp's mark (speech bubble with a handset), drawn as one shape with
// no background: black in day mode, white when the phone or computer is in
// dark mode. Sized like the lucide icons beside it (pass h-/w- classes).
export default function WhatsAppIcon({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="40 40 800 800"
      className={`flex-shrink-0 text-black dark:text-white ${className}`}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      focusable="false"
      data-testid="whatsapp-icon"
    >
      <path d="M52 775 L113 605 A358 358 0 1 1 243 722 Z M140 692 L174 598 A303 303 0 1 1 245 664 Z" />
      <path d="M262 218 L300 218 Q312 220 318 232 L347 306 Q352 318 343 334 Q332 354 320 368 Q312 378 320 390 Q378 482 456 512 Q468 516 476 506 L498 476 Q508 462 522 468 L596 503 Q608 510 605 525 Q600 560 585 575 Q555 605 505 605 Q470 605 420 583 Q330 543 265 448 Q218 380 218 320 Q218 255 245 228 Q252 220 262 218 Z" />
    </svg>
  )
}
