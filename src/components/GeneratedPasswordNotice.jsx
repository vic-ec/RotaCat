import { useState } from 'react'

// The generated password, shown to the admin exactly once and only when
// the welcome email could not be delivered — the fallback so they can
// relay it by hand rather than being left with an account nobody can sign
// into. Shared by AddStaffModal and RegeneratePasswordModal.
//
// The password reached the browser in that one Edge Function response and
// lives in component state until the modal closes. It is not persisted, not
// logged, and not written to any table — closing the modal is the last
// copy going away, which is why the copy is offered here rather than
// expecting the admin to retype it from a screenshot.
export default function GeneratedPasswordNotice({ password }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (an insecure origin, a permission
      // prompt denied) — the password is on screen either way.
      setCopied(false)
    }
  }

  return (
    <div className="mt-3 rounded border border-slate-line bg-canvas-sunken px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Generated password</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 break-all font-mono text-base font-semibold text-ink">{password}</code>
        <button type="button" onClick={copy} className="btn-secondary flex-shrink-0">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Pass this on directly. It&apos;s shown here once and isn&apos;t stored anywhere — if it&apos;s
        lost, use Regenerate password on their row in the staff list to issue a new one.
      </p>
    </div>
  )
}
