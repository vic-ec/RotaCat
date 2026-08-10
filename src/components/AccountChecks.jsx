import { CircleCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import SectionLabel from './SectionLabel'

// A concise checklist, not another form card — icon + text per row (never
// color alone), each row backed by data actually already on the page. Omit
// the whole section rather than call this with invented/placeholder checks;
// `checks` should be built by the caller only from what it can genuinely
// compute. `to`, when present on an item, renders as a link to the
// relevant existing route (e.g. an existing account a new registration
// might duplicate).
export default function AccountChecks({ checks }) {
  if (!checks || checks.length === 0) return null
  return (
    <div>
      <SectionLabel>Account checks</SectionLabel>
      <div className="space-y-2">
        {checks.map(check => (
          <div key={check.key} className="flex items-start gap-2 text-xs">
            {check.ok ? (
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" />
            ) : (
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-flagAmber" />
            )}
            <div className="min-w-0">
              <span className={check.ok ? 'text-ink-light' : 'text-flagAmber'}>{check.label}</span>
              {check.to && (
                <Link to={check.to} className="mt-0.5 block font-medium text-accent hover:underline">
                  {check.linkLabel || 'Review'} ›
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
