// Back chevron (roster set-up pages). Kept rather than lucide's ChevronLeft,
// which is a smaller chevron. One shared copy (it used to be redrawn in
// several files). Pass h-/w- classes to size it; it takes the colour of the
// text around it.
export default function ChevronLeftIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}
