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
//   WhatsApp          opens WhatsApp with a ready message asking them to
//                     sign up; their approval then matches on mobile.
//   Create account    the ordinary Add staff form, prefilled (needs their
//                     email).
//   Link to account   they already have one: move the shifts onto it. An
//                     account with the same mobile is suggested.
//
// Lives in the Staff page's Account Requests tab as one section of its
// table (the heading is the tab's own section bar); the rows here are the
// table's rows. `onCount` reports how many there are, for the badge and
// the notice on the other tabs. Renders nothing when there are none.
export default function LocumContactsPanel({ onLinked, onCount }) {
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
    onCount?.(open.length)
    setShiftCounts(await fetchContactShiftCounts(open.map(r => r.id)))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once

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
    <div data-testid="locum-contacts-panel">
      {error && <p className="px-4 pt-3 text-xs text-flagRed" role="alert">{error}</p>}
      {/* A compact table: name and mobile, shifts, then the three actions.
          Grid from sm up; the columns stack on a phone with the actions as
          one row of small buttons. */}
      <div className="hidden grid-cols-[1.4fr_1fr_auto] gap-x-4 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted sm:grid">
        <span>Locum</span><span>Shifts</span><span className="text-right">Get them an account</span>
      </div>
      <ul className="divide-y divide-slate-line">
        {rows.map(row => {
          const count = shiftCounts.get(row.id) || 0
          const fullName = `${row.name} ${row.surname}`.trim()
          const match = findByPhone(accounts, row.phone)
          const inviteHref = phoneWhatsAppMessageHref(row.phone, locumInviteText({ name: row.name, signupUrl, shiftCount: count }))
          return (
            <li key={row.id} className="px-4 py-2.5">
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{fullName}</p>
                  <a href={phoneTelHref(row.phone)} className="text-xs text-accent underline">{formatPhoneDisplay(row.phone)}</a>
                </div>
                <p className="text-xs text-ink-muted sm:text-sm">{count} shift{count === 1 ? '' : 's'}</p>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {inviteHref && (
                    <a href={inviteHref} target="_blank" rel="noopener noreferrer" className="btn-secondary h-[30px] px-2.5 text-xs">
                      WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={() => setCreatingFor(row)} className="btn-secondary h-[30px] px-2.5 text-xs">
                    Create account
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLinkingFor(linkingFor === row.id ? null : row.id); setLinkTarget(match?.id ?? null) }}
                    className="btn-secondary h-[30px] px-2.5 text-xs"
                  >
                    Link to account
                  </button>
                </div>
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
    </div>
  )
}
