// A bold tick (stroke 3), as used in the Toolbar and FilterPanel option
// lists. Kept rather than lucide's Check, which is a thinner tick of a
// different shape. One shared copy (it used to be redrawn in several files).
// Pass h-/w- classes to size it; it takes the colour of the text around it.
export default function CheckIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
