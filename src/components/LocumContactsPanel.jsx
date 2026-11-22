import { Fragment, useEffect, useState } from 'react'
import { Link2, MessageCircle, UserPlus } from 'lucide-react'
import ProfileAvatar from './ProfileAvatar'
import RowActionIcon from './RowActionIcon'
import AddStaffModal from './AddStaffModal'
import SelectMenu from './SelectMenu'
import { formatPhoneDisplay, phoneTelHref, phoneWhatsAppMessageHref } from '../lib/phone'
import {
  fetchOpenLocumContacts, fetchContactShiftCounts, fetchContactShifts, fetchLocumProfiles, findByPhone, linkLocumContact, locumInviteText,
} from '../lib/locumCover'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import { formatDayMonthYear } from '../lib/dateRange'
import { shiftTimeRange } from '../lib/shiftLabels'

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
  // Tapping a row: their rostered shifts, newest first, each linking to
  // its cell on the roster.
  const [shiftsFor, setShiftsFor] = useState(null) // { row, shifts } | null

  async function openShifts(row) {
    setShiftsFor({ row, shifts: null })
    setShiftsFor({ row, shifts: await fetchContactShifts(row.id) })
  }

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

  // The actions, as the Staff list draws its own: icon-only, titled.
  const actionIcons = (row, count, match, inviteHref) => (
    <div className="flex items-center justify-end gap-0.5">
      {inviteHref && (
        <RowActionIcon icon={<MessageCircle className="h-4 w-4" />} title="WhatsApp" label={`WhatsApp ${row.name}`} href={inviteHref} />
      )}
      <RowActionIcon icon={<UserPlus className="h-4 w-4" />} title="Create account" label={`Create ${row.name}'s account`} onClick={() => setCreatingFor(row)} />
      <RowActionIcon
        icon={<Link2 className="h-4 w-4" />}
        title="Link to account"
        label={`Link ${row.name} to an existing account`}
        onClick={() => { setLinkingFor(linkingFor === row.id ? null : row.id); setLinkTarget(match?.id ?? null) }}
      />
    </div>
  )

  // The follow-ups under a row: the same-mobile suggestion, or the picker.
  const followUp = (row, count, match) => (
    <>
      {match && linkingFor !== row.id && (
        <p className="text-xs text-ink-light" data-testid="contact-match">
          Same mobile as {match.name} {match.surname}&rsquo;s account.{' '}
          <button type="button" disabled={busy} onClick={() => link(row, match.id)} className="font-medium text-accent underline">
            Move the shifts onto it
          </button>
        </p>
      )}
      {linkingFor === row.id && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] flex-1">
            <SelectMenu value={linkTarget} onChange={setLinkTarget} options={accountOptions} placeholder="Choose their locum account…" />
          </div>
          <button type="button" disabled={busy || !linkTarget} onClick={() => link(row, linkTarget)} className="btn-primary px-3 py-1.5 text-xs">
            Move {count} shift{count === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </>
  )

  const prepared = rows.map(row => {
    const count = shiftCounts.get(row.id) || 0
    return {
      row, count,
      fullName: `${row.name} ${row.surname}`.trim(),
      match: findByPhone(accounts, row.phone),
      inviteHref: phoneWhatsAppMessageHref(row.phone, locumInviteText({ name: row.name, signupUrl, shiftCount: count })),
    }
  })

  return (
    <div data-testid="locum-contacts-panel">
      {error && <p className="px-4 pt-3 text-xs text-flagRed" role="alert">{error}</p>}

      {/* Phone: the Staff list's card rows — avatar, name, a line of meta,
          the actions as icons. The mobile number is left off; WhatsApp is
          the way to reach them from here. */}
      <ul className="divide-y divide-slate-line md:hidden">
        {prepared.map(({ row, count, fullName, match, inviteHref }) => (
          <li key={row.id} className="px-4 py-1">
            <div className="flex cursor-pointer items-center gap-3 py-1" onClick={() => openShifts(row)} data-testid="locum-contact-row">
              <ProfileAvatar profile={row} size={40} className="flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{fullName}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">Locum · {count} shift{count === 1 ? '' : 's'}</span>
              </div>
              {actionIcons(row, count, match, inviteHref)}
            </div>
            {(match || linkingFor === row.id) && <div className="pb-2 pl-[52px]">{followUp(row, count, match)}</div>}
          </li>
        ))}
      </ul>

      {/* Desktop: the Staff table's columns. */}
      <table className="hidden w-full table-fixed text-left md:table">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            <th className="px-2.5 py-2">Locum</th>
            <th className="w-40 px-2.5 py-2">Mobile</th>
            <th className="w-24 px-2.5 py-2">Shifts</th>
            <th className="w-28 px-2.5 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {prepared.map(({ row, count, fullName, match, inviteHref }) => (
            <Fragment key={row.id}>
              <tr className="cursor-pointer border-b border-slate-line last:border-0 transition-colors hover:bg-canvas-sunken" onClick={() => openShifts(row)}>
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center gap-2.5">
                    <ProfileAvatar profile={row} size={30} className="flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{fullName}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-muted">Locum · no account yet</span>
                    </div>
                  </div>
                </td>
                <td className="px-2.5 py-1.5 text-sm"><a href={phoneTelHref(row.phone)} className="text-accent underline">{formatPhoneDisplay(row.phone)}</a></td>
                <td className="px-2.5 py-1.5 text-sm text-ink-muted">{count}</td>
                <td className="px-2.5 py-1.5">{actionIcons(row, count, match, inviteHref)}</td>
              </tr>
              {(match || linkingFor === row.id) && (
                <tr className="border-b border-slate-line last:border-0">
                  <td colSpan={4} className="px-2.5 pb-2 pl-[50px]">{followUp(row, count, match)}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {shiftsFor && (
        <Modal title={`${shiftsFor.row.name} ${shiftsFor.row.surname} — rostered shifts`} onClose={() => setShiftsFor(null)}>
          {shiftsFor.shifts === null ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : shiftsFor.shifts.length === 0 ? (
            <p className="text-sm text-ink-muted">No shifts on the roster.</p>
          ) : (
            <ul className="divide-y divide-slate-line" data-testid="contact-shifts">
              {shiftsFor.shifts.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-ink">{formatDayMonthYear(s.date)} · {shiftTimeRange(s.code)}</span>
                  <Link
                    to={`/roster/${s.rosterMonthId}?date=${s.date}&entry=${s.id}`}
                    onClick={() => setShiftsFor(null)}
                    className="flex-shrink-0 text-xs font-medium text-accent hover:underline"
                  >
                    View on roster ›
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

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
