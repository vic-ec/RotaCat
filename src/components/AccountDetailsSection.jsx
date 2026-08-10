import { CircleCheck } from 'lucide-react'
import SectionLabel from './SectionLabel'

// One labeled details section, in one of two modes:
//  - read-only (`editing` false, the default for a pending registration's
//    submitted details): compact label/value rows in a bordered box — not
//    inputs that merely look editable, so an admin deciding access can't
//    mistake "displaying what was submitted" for "safe to type over".
//  - editable (`editing` true): persistent visible labels above real
//    inputs, with a `* Required` legend and inline error/hint text per
//    field — never placeholder-as-label, never color-only validation.
//
// `fields`: [{ key, label, value, href, verified, required, type,
//   inputMode, placeholder, onChange, error, hint, alwaysReadOnly }].
// `onChange` is only read in editing mode; `href`/`verified` only in
// read-only mode. `alwaysReadOnly` pins one field (e.g. a verified email
// address) to its read-only row even while the rest of the section is
// editing — for a section with a mix of correctable and never-editable
// fields (see PendingApprovalReviewPage's Submitted details).
export default function AccountDetailsSection({ heading, action, fields, editing = false }) {
  const anyRequired = editing && fields.some(f => f.required)
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel className="mb-0">{heading}</SectionLabel>
        {action}
      </div>
      {anyRequired && <p className="mt-1 text-xs text-ink-muted">* Required</p>}

      <div className={`mt-2 ${editing ? 'space-y-4' : 'divide-y divide-slate-line rounded-lg border border-slate-line'}`}>
        {fields.map(field => (editing && !field.alwaysReadOnly) ? (
          <div key={field.key}>
            <label htmlFor={field.key} className="label-text">
              {field.label}{field.required && ' *'}
            </label>
            <input
              id={field.key}
              type={field.type || 'text'}
              inputMode={field.inputMode}
              value={field.value}
              onChange={e => field.onChange(e.target.value)}
              placeholder={field.placeholder}
              aria-describedby={field.error ? `${field.key}-error` : field.hint ? `${field.key}-hint` : undefined}
              aria-invalid={field.error ? 'true' : undefined}
              className="input-field"
            />
            {field.error ? (
              <p id={`${field.key}-error`} className="mt-1 text-xs text-flagRed">{field.error}</p>
            ) : field.hint ? (
              <p id={`${field.key}-hint`} className="mt-1 text-xs text-ink-muted">{field.hint}</p>
            ) : null}
          </div>
        ) : (
          <div key={field.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="flex-shrink-0 text-ink-muted">{field.label}</span>
            {field.href ? (
              <a href={field.href} className="flex min-w-0 items-center gap-1.5 truncate text-ink hover:underline">
                <span className="truncate select-text">{field.value || '—'}</span>
                {field.verified && <CircleCheck title="Verified" className="h-3.5 w-3.5 flex-shrink-0 text-success" />}
              </a>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 truncate text-ink">
                <span className="truncate select-text">{field.value || '—'}</span>
                {field.verified && <CircleCheck title="Verified" className="h-3.5 w-3.5 flex-shrink-0 text-success" />}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
