import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

// "‹ Dashboard": the app's standard back, at the top of a page opened by a
// link (see lib/backNav.js). Goes back through history, so the page you
// return to is as you left it (scroll, tab, filters).
export default function BackLink({ target, className = '' }) {
  const navigate = useNavigate()
  if (!target) return null
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      data-testid="back-link"
      className={`-ml-1 mb-2 inline-flex min-h-[44px] items-center gap-0.5 rounded px-1 text-sm font-medium text-accent hover:text-accent-dark md:min-h-0 md:py-1 ${className}`}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {target.label}
    </button>
  )
}
