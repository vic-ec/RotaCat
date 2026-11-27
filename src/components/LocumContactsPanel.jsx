import { Fragment, useEffect, useRef, useState } from 'react'
import { Link2, MoreHorizontal, Pencil, UserPlus } from 'lucide-react'
import { QuickActionRow } from './ContactQuickMenu'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import WhatsAppIcon from './icons/WhatsAppIcon'
import ProfileAvatar from './ProfileAvatar'
import RowActionIcon from './RowActionIcon'
import AddStaffModal from './AddStaffModal'
import SelectMenu from './SelectMenu'
import { formatPhoneDisplay, formatPhoneProgressive, phoneTelHref, phoneWhatsAppMessageHref } from '../lib/phone'
import {
  fetchOpenLocumContacts, fetchContactShiftCounts, fetchContactShifts, fetchLocumProfiles, findByPhone, linkLocumContact, locumInviteText,
  phoneKey, updateLocumContactPhone, fetchContactChanges,
} from '../lib/locumCover'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import { formatDayMonthYear } from '../lib/dateRange'
import { shiftTimeRange, labelForShiftCode } from '../lib/shiftLabels'
import { fetchLateArrivalsForLocum, lateByLabel } from '../lib/lateArrivals'
import { shiftStartLabel } from '../lib/myYear'

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
// The pencil corrects the mobile (which otherwise only an account could
// carry): it opens a field under the row, where Link opens its picker.
//
// Lives in the Staff page's Account Requests tab as one section of its
// table (the heading is the tab's own section bar); the rows here are the
// table's rows. `onCount` reports how many there are, for the badge and
// the notice on the other tabs. Renders nothing when there are none.
// "26 Nov 2026, 14:32"
function formatChangeTime(value) {
  return new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function LocumContactsPanel({ onLinked, onCount }) {
  const [rows, setRows] = useState([])
  const [shiftCounts, setShiftCounts] = useState(new Map())
  const [accounts, setAccounts] = useState([])
  const [creatingFor, setCreatingFor] = useState(null)
  const [linkingFor, setLinkingFor] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  // The mobile being corrected: { id, digits, saving, error } | null.
  const [phoneEdit, setPhoneEdit] = useState(null)
  const [savedPhoneFor, setSavedPhoneFor] = useState(null)
  const [error, setError] = useState('')
  // Tapping a row: their rostered shifts, newest first, each linking to
  // its cell on the roster.
  const [shiftsFor, setShiftsFor] = useState(null) // { row, shifts } | null

  async function openShifts(row) {
    setShiftsFor({ row, shifts: null, late: null, changes: [] })
    const [shifts, changes] = await Promise.all([fetchContactShifts(row.id), fetchContactChanges(row.id)])
    setShiftsFor(current => (current?.row.id === row.id ? { ...current, shifts, changes } : current))
    // A locum has no My year page, so their late arrivals are listed here
    // (this panel is admin only). Read after the shifts, never blocking them.
    const late = await fetchLateArrivalsForLocum({ contactId: row.id, name: `${row.name} ${row.surname}`.trim() }).catch(() => [])
    setShiftsFor(current => (current?.row.id === row.id ? { ...current, late } : current))
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

  // Phone: one quick-action menu per row (as on the Staff list) in place
  // of four icons. { id, anchor (DOMRect) } or null.
  const [menuFor, setMenuFor] = useState(null)
  const menuRef = useRef(null)
  const menuTriggerRef = useRef(null)
  const closeMenu = () => { setMenuFor(null); menuTriggerRef.current = null }
  useDismissablePopover(Boolean(menuFor), closeMenu, menuRef, menuTriggerRef)
  function toggleMenu(row, el) {
    if (menuFor?.id === row.id) { closeMenu(); return }
    menuTriggerRef.current = el
    setMenuFor({ id: row.id, anchor: el.getBoundingClientRect() })
  }
  const toggleLinking = (row, match) => { setPhoneEdit(null); setLinkingFor(linkingFor === row.id ? null : row.id); setLinkTarget(match?.id ?? null) }

  function openPhoneEdit(row) {
    setLinkingFor(null)
    setPhoneEdit(current => (current?.id === row.id ? null : { id: row.id, digits: (row.phone || '').replace(/\D/g, '').slice(0, 10), saving: false, error: '' }))
  }

  async function savePhone(row) {
    if (!phoneEdit) return
    setPhoneEdit(e => ({ ...e, saving: true, error: '' }))
    try {
      const digits = await updateLocumContactPhone(row.id, phoneEdit.digits)
      setRows(list => list.map(r => (r.id === row.id ? { ...r, phone: digits } : r)))
      setPhoneEdit(null)
      setSavedPhoneFor(row.id)
      // The trigger has recorded the change; an open window on this locum
      // shows it at once.
      fetchContactChanges(row.id).then(changes => setShiftsFor(current => (current?.row.id === row.id ? { ...current, changes } : current)))
      setTimeout(() => setSavedPhoneFor(id => (id === row.id ? null : id)), 2000)
    } catch (err) {
      setPhoneEdit(e => (e ? { ...e, saving: false, error: err.message } : e))
    }
  }

  // Another contact on this list, or a locum account, with the number
  // being typed: worth knowing (a placeholder number shared between
  // locums), not a reason to refuse it.
  function sharedNumberNote(row, digits) {
    if (digits.length !== 10) return null
    const other = rows.find(r => r.id !== row.id && phoneKey(r.phone) === phoneKey(digits))
    if (other) return `Also ${other.name} ${other.surname}'s number.`
    const account = findByPhone(accounts, digits)
    return account ? `Same mobile as ${account.name} ${account.surname}'s account.` : null
  }

  if (rows.length === 0 && !creatingFor && !error) return null

  const signupUrl = `${window.location.origin}/signup`
  const accountOptions = accounts.map(a => ({ value: a.id, label: `${a.surname}, ${a.name}` }))

  // The actions, as the Staff list draws its own: icon-only, titled.
  const actionIcons = (row, count, match, inviteHref) => (
    <div className="flex items-center justify-end gap-0.5">
      <RowActionIcon
        icon={<Pencil className="h-4 w-4" />}
        title="Edit mobile"
        label={`Edit ${row.name}'s mobile number`}
        onClick={() => openPhoneEdit(row)}
      />
      {inviteHref && (
        <RowActionIcon icon={<WhatsAppIcon className="h-4 w-4" />} title="WhatsApp" label={`WhatsApp ${row.name}`} href={inviteHref} />
      )}
      <RowActionIcon icon={<UserPlus className="h-4 w-4" />} title="Create account" label={`Create ${row.name}'s account`} onClick={() => setCreatingFor(row)} />
      <RowActionIcon
        icon={<Link2 className="h-4 w-4" />}
        title="Link to account"
        label={`Link ${row.name} to an existing account`}
        onClick={() => toggleLinking(row, match)}
      />
    </div>
  )

  // Phone: the same four, in a menu off a ⋯ button.
  const menuButton = row => (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); toggleMenu(row, e.currentTarget) }}
      aria-label={`Actions for ${row.name} ${row.surname}`}
      aria-haspopup="menu"
      aria-expanded={menuFor?.id === row.id}
      className="relative flex-shrink-0 rounded p-1.5 text-ink-muted transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
    >
      <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
    </button>
  )

  // The follow-ups under a row: the same-mobile suggestion, or the picker.
  const phoneEditor = row => {
    const digits = phoneEdit.digits
    const unchanged = digits === (row.phone || '').replace(/\D/g, '')
    const short = digits.length > 0 && digits.length < 10
    const note = sharedNumberNote(row, digits)
    return (
      <form
        data-testid="contact-phone-editor"
        onSubmit={e => { e.preventDefault(); savePhone(row) }}
        onKeyDown={e => { if (e.key === 'Escape') setPhoneEdit(null) }}
        className="max-w-xs space-y-1.5"
      >
        <input
          type="tel"
          autoFocus
          aria-label={`${row.name}'s mobile number`}
          value={formatPhoneProgressive(digits)}
          onChange={e => { const next = e.target.value.replace(/\D/g, '').slice(0, 10); setPhoneEdit(p => ({ ...p, digits: next, error: '' })) }}
          placeholder="e.g. (082) 123 4567"
          className="input-field"
        />
        {short && <p className="text-xs font-medium text-flagRed">Enter all 10 digits.</p>}
        {!short && note && <p className="rounded bg-flagAmber-bg px-1.5 py-1 text-xs text-flagAmber" data-testid="contact-phone-shared">{note}</p>}
        {phoneEdit.error && <p className="text-xs font-medium text-flagRed" role="alert">{phoneEdit.error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={phoneEdit.saving || unchanged || digits.length !== 10} className="btn-primary px-3 py-1.5 text-xs">
            {phoneEdit.saving ? 'Saving…' : 'Update'}
          </button>
          <button type="button" onClick={() => setPhoneEdit(null)} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
        </div>
      </form>
    )
  }

  const followUp = (row, count, match) => phoneEdit?.id === row.id ? phoneEditor(row) : (
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
          <button type="button" disabled={busy} onClick={() => { setLinkingFor(null); setLinkTarget(null) }} className="btn-secondary px-3 py-1.5 text-xs">
            Cancel
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

      {/* Phone: the Staff list's card rows — avatar, name, the mobile and
          shift count on one line, the four actions in one ⋯ menu. */}
      <ul className="divide-y divide-slate-line md:hidden">
        {prepared.map(({ row, count, fullName, match }) => (
          <li key={row.id} className="px-4 py-1">
            <div className="flex cursor-pointer items-center gap-3 py-1" onClick={() => openShifts(row)} data-testid="locum-contact-row">
              <ProfileAvatar profile={row} size={40} className="flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{fullName}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-muted">
                  {formatPhoneDisplay(row.phone)}{savedPhoneFor === row.id && <span className="ml-1 font-semibold text-accent-dark">Saved</span>} · {count} shift{count === 1 ? '' : 's'}
                </span>
              </div>
              {menuButton(row)}
            </div>
            {(match || linkingFor === row.id || phoneEdit?.id === row.id) && <div className="pb-2 pl-[52px]">{followUp(row, count, match)}</div>}
          </li>
        ))}
      </ul>
      {menuFor && (() => {
        const item = prepared.find(p => p.row.id === menuFor.id)
        if (!item) return null
        const { row, match, inviteHref } = item
        const width = 232
        const pick = fn => () => { closeMenu(); fn() }
        return (
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for ${row.name} ${row.surname}`}
            data-testid="locum-actions-menu"
            style={{ ...computeAnchoredPosition(menuFor.anchor, width), width }}
            className="fixed z-50 overflow-hidden rounded-xl border border-edge bg-canvas-raised py-1 shadow-raised md:hidden"
          >
            <QuickActionRow icon={<Pencil className="h-5 w-5" />} label="Edit mobile" onClick={pick(() => openPhoneEdit(row))} />
            <QuickActionRow
              icon={<WhatsAppIcon className="h-5 w-5" />}
              label="Invite on WhatsApp"
              href={inviteHref || null}
              external
              disabled={!inviteHref}
              title={inviteHref ? undefined : 'No mobile on file'}
              onClick={inviteHref ? closeMenu : undefined}
            />
            <QuickActionRow icon={<UserPlus className="h-5 w-5" />} label="Create account" onClick={pick(() => setCreatingFor(row))} />
            <QuickActionRow icon={<Link2 className="h-5 w-5" />} label="Link to existing account" onClick={pick(() => toggleLinking(row, match))} />
          </div>
        )
      })()}

      {/* Desktop: the Staff table's columns. */}
      <table className="hidden w-full table-fixed text-left md:table">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            <th className="px-2.5 py-2">Locum</th>
            <th className="w-40 px-2.5 py-2">Mobile</th>
            <th className="w-24 px-2.5 py-2">Shifts</th>
            <th className="w-36 px-2.5 py-2 text-right">Actions</th>
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
                <td className="px-2.5 py-1.5 text-sm">
                  <a href={phoneTelHref(row.phone)} onClick={e => e.stopPropagation()} className="text-accent underline">{formatPhoneDisplay(row.phone)}</a>
                  {savedPhoneFor === row.id && <span className="ml-1.5 text-xs font-semibold text-accent-dark">Saved</span>}
                </td>
                <td className="px-2.5 py-1.5 text-sm text-ink-muted">{count}</td>
                <td className="px-2.5 py-1.5">{actionIcons(row, count, match, inviteHref)}</td>
              </tr>
              {(match || linkingFor === row.id || phoneEdit?.id === row.id) && (
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
          {shiftsFor.shifts !== null && (
            <div className="mt-4 border-t border-slate-line pt-3" data-testid="contact-late-arrivals">
              <h3 className="text-sm font-semibold text-ink">Late arrivals</h3>
              {shiftsFor.late === null ? (
                <p className="mt-1 text-sm text-ink-muted">Loading…</p>
              ) : shiftsFor.late.length === 0 ? (
                <p className="mt-1 text-sm text-ink-muted">No late arrivals recorded.</p>
              ) : (
                <ul className="mt-1 divide-y divide-slate-line">
                  {shiftsFor.late.map(l => (
                    <li key={l.id} className="py-2 text-sm">
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-ink">{formatDayMonthYear(l.entry_date)} · {labelForShiftCode(l.shift_code)}</span>
                        <span className="flex-shrink-0 font-semibold text-ink">{lateByLabel(l.minutes_late)} late</span>
                      </p>
                      <p className="text-xs text-ink-muted">
                        Shift start {shiftStartLabel(l.shift_start)} · arrived {shiftStartLabel(l.arrived_at)} · reason given: {l.reason_given || '—'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {shiftsFor.changes?.length > 0 && (
            <div className="mt-4 border-t border-slate-line pt-3" data-testid="contact-phone-changes">
              <h3 className="text-sm font-semibold text-ink">Mobile number changes</h3>
              <ul className="mt-1 divide-y divide-slate-line">
                {shiftsFor.changes.map(c => (
                  <li key={c.id} className="py-2 text-sm">
                    <p className="text-ink">{formatPhoneDisplay(c.oldValue) || 'None'} → <span className="font-medium">{formatPhoneDisplay(c.newValue) || 'None'}</span></p>
                    <p className="text-xs text-ink-muted">{c.byName ? `By ${c.byName}` : 'By an admin'} · {formatChangeTime(c.at)}</p>
                  </li>
                ))}
              </ul>
            </div>
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
