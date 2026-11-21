import { useEffect, useState } from 'react'
import AddStaffModal from './AddStaffModal'
import { formatPhoneDisplay, phoneTelHref } from '../lib/phone'
import { fetchOpenLocumPlaceholders, fetchPlaceholderShiftCounts, linkLocumPlaceholder } from '../lib/locumCover'

// Locums who were put on the roster with only a name and mobile (see
// NewLocumModal) and still have no account. Each one is a loose end: they
// can't sign in or see their shifts until an account exists. "Create
// account" opens the ordinary Add staff form with what is already known
// filled in, and the moment the account is made their shifts move onto it.
//
// Renders nothing when there are none, so the Staff page is unchanged on
// an ordinary day.
export default function LocumPlaceholdersPanel({ onLinked }) {
  const [rows, setRows] = useState([])
  const [shiftCounts, setShiftCounts] = useState(new Map())
  const [creatingFor, setCreatingFor] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const open = await fetchOpenLocumPlaceholders()
    setRows(open)
    setShiftCounts(await fetchPlaceholderShiftCounts(open.map(r => r.id)))
  }
  useEffect(() => { load() }, [])

  async function handleAccountCreated(response) {
    if (!creatingFor || !response?.profileId) return
    try {
      await linkLocumPlaceholder({ placeholderId: creatingFor.id, profileId: response.profileId })
      setError('')
    } catch (err) {
      setError(`The account was created, but ${creatingFor.name} ${creatingFor.surname}'s shifts could not be moved onto it (${err.message}).`)
    }
  }

  if (rows.length === 0 && !creatingFor && !error) return null

  return (
    <section className="card mb-4 p-4" aria-label="Locums without an account" data-testid="locum-placeholders-panel">
      <h2 className="text-sm font-semibold text-ink">Locums on the roster without an account ({rows.length})</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        Added from the roster with a name and mobile only. Create an account and their shifts move onto it.
      </p>
      {error && <p className="mt-2 text-xs text-flagRed" role="alert">{error}</p>}
      <ul className="mt-2 divide-y divide-slate-line">
        {rows.map(row => {
          const count = shiftCounts.get(row.id) || 0
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="text-sm font-medium text-ink">{row.name} {row.surname}</span>
              <a href={phoneTelHref(row.phone)} className="text-xs text-accent underline">{formatPhoneDisplay(row.phone)}</a>
              <span className="text-xs text-ink-muted">{count} shift{count === 1 ? '' : 's'}</span>
              <button type="button" onClick={() => setCreatingFor(row)} className="btn-secondary ml-auto px-3 py-1.5 text-xs">
                Create account
              </button>
            </li>
          )
        })}
      </ul>

      {creatingFor && (
        <AddStaffModal
          initialValues={{ name: creatingFor.name, surname: creatingFor.surname, phone: creatingFor.phone, role: 'locum' }}
          onAccountCreated={handleAccountCreated}
          onCreated={() => { load(); onLinked?.() }}
          onClose={() => setCreatingFor(null)}
        />
      )}
    </section>
  )
}
