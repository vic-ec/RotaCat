import { useEffect, useState } from 'react'
import AddStaffModal from './AddStaffModal'
import SelectMenu from './SelectMenu'
import { formatPhoneDisplay, phoneTelHref, phoneWhatsAppMessageHref } from '../lib/phone'
import {
  fetchOpenLocumContacts, fetchContactShiftCounts, fetchLocumProfiles, findByPhone, linkLocumContact, locumInviteText,
} from '../lib/locumCover'

// Locums who were put on the roster with only a name and mobile (see
// NewLocumModal) and still have no account. Each one is a loose end: they
// can't sign in or see their shifts until an account exists. Three ways to
// close it, per row:
//
//   Invite on WhatsApp   opens WhatsApp with a ready message asking them to
//                        register; their approval then matches on mobile.
//   Create account       the ordinary Add staff form, prefilled (needs
//                        their email).
//   Link to account      they already have one: move the shifts onto it.
//                        An account with the same mobile is suggested.
//
// Renders nothing when there are none, so the Staff page is unchanged on
// an ordinary day.
export default function LocumContactsPanel({ onLinked }) {
  const [rows, setRows] = useState([])
  const [shiftCounts, setShiftCounts] = useState(new Map())
  const [accounts, setAccounts] = useState([])
  const [creatingFor, setCreatingFor] = useState(null)
  const [linkingFor, setLinkingFor] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [open, locums] = await Promise.all([fetchOpenLocumContacts(), fetchLocumProfiles()])
    setRows(open)
    setAccounts(locums)
    setShiftCounts(await fetchContactShiftCounts(open.map(r => r.id)))
  }
  useEffect(() => { load() }, [])

  async function link(contact, profileId) {
    setBusy(true)
    try {
      await linkLocumContact({ contactId: contact.id, profileId })
      setError('')
      setLinkingFor(null)
      setLinkTarget(null)
      await load()
      onLinked?.()
    } catch (err) {
      setError(`${contact.name} ${contact.surname}'s shifts could not be moved (${err.message}).`)
    }
    setBusy(false)
  }

  async function handleAccountCreated(response) {
    if (!creatingFor || !response?.profileId) return
    try {
      await linkLocumContact({ contactId: creatingFor.id, profileId: response.profileId })
      setError('')
    } catch (err) {
      setError(`The account was created, but ${creatingFor.name} ${creatingFor.surname}'s shifts could not be moved onto it (${err.message}).`)
    }
  }

  if (rows.length === 0 && !creatingFor && !error) return null

  const signupUrl = `${window.location.origin}/signup`
  const accountOptions = accounts.map(a => ({ value: a.id, label: `${a.surname}, ${a.name}` }))

  return (
    <section className="card mb-4 p-4" aria-label="Locums without an account" data-testid="locum-contacts-panel">
      <h2 className="text-sm font-semibold text-ink">Locums on the roster without an account ({rows.length})</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        Added from the roster with a name and mobile only. Once they have an account their shifts move onto it.
      </p>
      {error && <p className="mt-2 text-xs text-flagRed" role="alert">{error}</p>}
      <ul className="mt-2 divide-y divide-slate-line">
        {rows.map(row => {
          const count = shiftCounts.get(row.id) || 0
          const fullName = `${row.name} ${row.surname}`.trim()
          const match = findByPhone(accounts, row.phone)
          const inviteHref = phoneWhatsAppMessageHref(row.phone, locumInviteText({ name: row.name, signupUrl }))
          return (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-ink">{fullName}</span>
                <a href={phoneTelHref(row.phone)} className="text-xs text-accent underline">{formatPhoneDisplay(row.phone)}</a>
                <span className="text-xs text-ink-muted">{count} shift{count === 1 ? '' : 's'}</span>
                <span className="ml-auto flex flex-wrap gap-2">
                  {inviteHref && (
                    <a href={inviteHref} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 py-1.5 text-xs">
                      Invite on WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={() => setCreatingFor(row)} className="btn-secondary px-3 py-1.5 text-xs">
                    Create account
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLinkingFor(linkingFor === row.id ? null : row.id); setLinkTarget(match?.id ?? null) }}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Link to account
                  </button>
                </span>
              </div>
              {match && linkingFor !== row.id && (
                <p className="mt-1 text-xs text-ink-light" data-testid="contact-match">
                  Same mobile as {match.name} {match.surname}&rsquo;s account.{' '}
                  <button type="button" disabled={busy} onClick={() => link(row, match.id)} className="font-medium text-accent underline">
                    Move the shifts onto it
                  </button>
                </p>
              )}
              {linkingFor === row.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="min-w-[14rem] flex-1">
                    <SelectMenu value={linkTarget} onChange={setLinkTarget} options={accountOptions} placeholder="Choose their locum account…" />
                  </div>
                  <button type="button" disabled={busy || !linkTarget} onClick={() => link(row, linkTarget)} className="btn-primary px-3 py-1.5 text-xs">
                    Move {count} shift{count === 1 ? '' : 's'}
                  </button>
                </div>
              )}
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
