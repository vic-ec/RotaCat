// Sign-out arrow (sidebar and Account). Kept rather than lucide's LogOut,
// which draws its corners slightly differently. One shared copy (it used to
// be redrawn in several files). Pass h-/w- classes to size it; it takes the
// colour of the text around it.
export default function LogoutIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
