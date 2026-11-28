import { CircleCheck, ChevronDown as ChevronDownIcon } from 'lucide-react'
import ProfileAvatar, { StatusBadge } from '../../components/ProfileAvatar'
import RowActionIcon from '../../components/RowActionIcon'
import TempPasswordIndicator from '../../components/TempPasswordIndicator'
import PhoneIcon from '../../components/icons/PhoneIcon'
import EmailIcon from '../../components/icons/EmailIcon'
import { formatPhoneDisplay, phoneTelHref } from '../../lib/phone'
import { formatShortDateRange } from '../../lib/dateRange'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import { CONTRACT_TAG_TITLE, PERMISSION_LABELS, contractTagText } from './staffListHelpers'
import { MessageIcon } from './icons'

// The staff list from `md` up: one table panel per section. Moved out of StaffListPage as it was.
//
// A single promoted contact action, inline in the desktop table's Actions
// column — message/call/email get one-click icon buttons here instead of
// living only behind the kebab, per a UX review of the Staff list ("direct
// icons for quick use, kebab for less common actions"). Renders a real
// `<a>` when there's somewhere to go (so it behaves like any other link —
// middle-click, "open in new tab", etc. all work); falls back to a button
// that surfaces the existing missing-contact-detail toast otherwise. The
// kebab is left fully intact alongside these for WhatsApp and Update status,
// which don't have a natural single icon of their own.
// Now the shared RowActionIcon (src/components/RowActionIcon.jsx), so every
// table in the app uses the same one.
export default function DesktopStaffTable({
  isAdmin, canContact, navigate, location, togglingId, togglingAdminId, emailById, leaveProfileIds,
  neverSignedInIds, collapsedGroups, toggleGroupCollapsed, activeUntilFor, requestToggleActive, toggleAdmin,
  openContactFlyout, contactMissing, groups,
}) {
  return (
    <div className="hidden md:block">
      {groups.map(group => (
        <div key={group.key} className="mb-4 last:mb-0">
          {group.label && (() => {
            const activeCount = group.items.filter(p => p.is_active).length
            return (
            <button
              type="button"
              onClick={() => toggleGroupCollapsed(group.key)}
              aria-expanded={!collapsedGroups[group.key]}
              className="sheen-divider mb-2 w-full transition-[filter] hover:brightness-110 active:brightness-110"
            >
              <span>{group.label} <span className="divider-meta ml-2 normal-case font-normal">{group.items.length} total • {activeCount} active</span></span>
              <ChevronDownIcon className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
            </button>
            )
          })()}
          {(!group.label || !collapsedGroups[group.key]) && (
          <div className="card overflow-x-auto" data-testid="staff-section-panel">
            <table className="w-full min-w-[680px] table-fixed border-collapse text-xs">
              <colgroup>
                {/* Contact takes a share of the width (it grows and
                    shrinks with the window); a long email truncates
                    inside it rather than running into Status. */}
                <col />
                <col className="w-[30%]" />
                <col className="w-52" />
                {isAdmin && <col className="w-24" />}
                {canContact && <col className="w-32" />}
              </colgroup>
                <thead>
                  <tr className="border-b border-slate-line bg-canvas-cool text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    <th className="px-2.5 py-2">Person</th>
                    <th className="px-2.5 py-2">Contact</th>
                    <th className="px-2.5 py-2">Status</th>
                    {isAdmin && <th className="px-2.5 py-2">Is Admin</th>}
                    {canContact && <th className="px-2.5 py-2 text-right">Actions</th>}
                  </tr>
                </thead>
              <tbody>
                    {group.items.map(person => {
                      const isToggling = togglingId === person.id
                      const formattedPhone = formatPhoneDisplay(person.phone)
                      const contractTag = contractTagText(person)
                      // Same "category if doctor, else role" pick as the mobile
                      // card list and the Pending-approval row — one primary
                      // identity label, not a separate Role column and a
                      // separate Category column competing for attention.
                      const secondaryLabel = person.role === 'doctor'
                        ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
                        : (ROLE_LABELS[person.role] || person.role)
                      const targetEmail = emailById[person.id]
                      const firstNameForMissing = person.name || person.surname || 'this person'
                      return (
                        <tr
                          key={person.id}
                          // Opens as a slide-over panel (state.backgroundLocation)
                          // rather than a full-page navigation — see
                          // AccountSlideOverPanel/App.jsx.
                          onClick={() => isAdmin && navigate(`/account/${person.id}`, { state: { backgroundLocation: location } })}
                          title={isAdmin ? `Open ${person.name || ''} ${person.surname}'s account settings` : undefined}
                          // No fade on an inactive account — the Status
                          // column (toggle off + red "Inactive") is the
                          // signal. Dimming the whole row also washed
                          // that red label out to grey.
                          className={`border-b border-slate-line last:border-0 transition-colors hover:bg-canvas-sunken ${
                            isAdmin ? 'cursor-pointer active:bg-slate-line' : ''
                          }`}
                        >
                          <td className="px-2.5 py-1.5">
                            <div className="flex items-center gap-2.5">
                              <ProfileAvatar profile={person} size={30} className="flex-shrink-0" />
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-ink">
                                  {person.name ? `${person.name} ` : ''}{person.surname}
                                </span>
                                <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-muted">
                                  <span>{secondaryLabel}</span>
                                  {contractTag && (
                                    <span
                                      className="chip-mint rounded px-1 py-0.5 text-[10px] font-semibold"
                                      title={CONTRACT_TAG_TITLE[person.contract_type]}
                                    >
                                      {contractTag}
                                    </span>
                                  )}
                                  {isAdmin && person.is_admin && (
                                    <span className={`font-semibold uppercase tracking-wide ${person.is_super_admin ? 'text-flagBlue' : 'text-accent'}`}>
                                      {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="overflow-hidden px-2.5 py-1.5 text-ink">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                                <PhoneIcon className="h-3 w-3 flex-shrink-0 text-ink-muted" />
                                {formattedPhone ? (
                                  <a
                                    href={phoneTelHref(person.phone)}
                                    onClick={e => e.stopPropagation()}
                                    className="hover:underline"
                                  >
                                    {formattedPhone}
                                  </a>
                                ) : <span>—</span>}
                              </div>
                              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                                <EmailIcon className="h-3 w-3 flex-shrink-0 text-ink-muted" />
                                {targetEmail && person.email_verified ? (
                                  <a
                                    href={`mailto:${targetEmail}`}
                                    onClick={e => e.stopPropagation()}
                                    title={targetEmail}
                                    className="min-w-0 truncate hover:underline"
                                  >
                                    {targetEmail}
                                  </a>
                                ) : (
                                  <span className="min-w-0 truncate" title={targetEmail || undefined}>{targetEmail || '—'}</span>
                                )}
                                {targetEmail && person.email_verified && (
                                  <CircleCheck title="Email verified" className="h-3 w-3 flex-shrink-0 text-success" />
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5">
                              {isAdmin ? (
                                <>
                                  <button
                                    onClick={e => { e.stopPropagation(); !isToggling && requestToggleActive(person) }}
                                    disabled={isToggling}
                                    title={person.is_active ? 'Click to deactivate' : 'Click to activate'}
                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                                      person.is_active ? 'bg-accent' : 'bg-slate-line'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                        person.is_active ? 'translate-x-4' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                  {person.is_active && leaveProfileIds.has(person.id) && (
                                    <StatusBadge active onLeave size={14} />
                                  )}
                                </>
                              ) : (
                                <StatusBadge active={person.is_active} onLeave={leaveProfileIds.has(person.id)} size={14} />
                              )}
                              <span className={`whitespace-nowrap text-[11px] font-medium ${
                                !person.is_active ? 'text-flagRed' : leaveProfileIds.has(person.id) ? 'text-ink-muted' : 'text-success'
                              }`}>
                                {/* The activity period, for anyone whose
                                    account has one: "Active until" for a
                                    running placement, "Starts" for one
                                    scheduled to begin. Category-agnostic —
                                    interns, registrars and anyone else an
                                    admin has given dates. */}
                                {!person.is_active
                                  ? (person.scheduled_active_date
                                      ? <>Starts {formatShortDateRange(person.scheduled_active_date, person.scheduled_active_date)}</>
                                      : 'Inactive')
                                  : leaveProfileIds.has(person.id) ? 'On leave' : 'Active'}
                                {person.is_active && activeUntilFor(person) && (
                                  <> until {formatShortDateRange(activeUntilFor(person), activeUntilFor(person))}</>
                                )}
                              </span>
                              {isAdmin && (person.scheduled_inactive_date || person.scheduled_active_date) && (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); navigate(`/account/${person.id}`, { state: { backgroundLocation: location } }) }}
                                  title="Edit this account"
                                  aria-label={`Edit ${person.name} ${person.surname}`}
                                  className="text-[11px] font-medium text-accent hover:text-accent-dark hover:underline"
                                >
                                  Edit
                                </button>
                              )}
                              {/* Pinned to the cell's right edge (ml-auto)
                                  rather than trailing the status text,
                                  which varies in length row to row
                                  ("Active" vs "Active until 31 Dec Edit")
                                  and carried the shield with it. */}
                              {isAdmin && person.must_change_password && <TempPasswordIndicator className="ml-auto pl-2" notSignedIn={!person.is_active || neverSignedInIds.has(person.id)} person={person} />}
                            </div>
                          </td>
                          {isAdmin && (
                            <td className="px-2.5 py-1.5">
                              {person.role === 'clerk' ? (
                                <span className="text-[11px] text-ink-muted">—</span>
                              ) : (
                                <button
                                  onClick={e => { e.stopPropagation(); togglingAdminId !== person.id && toggleAdmin(person) }}
                                  disabled={togglingAdminId === person.id || person.is_super_admin}
                                  title={person.is_super_admin ? 'Super-admin — manage from their own Account page' : (person.is_admin ? 'Click to revoke admin' : 'Click to grant admin')}
                                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                    person.is_admin ? 'bg-accent' : 'bg-slate-line'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                      person.is_admin ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              )}
                            </td>
                          )}
                          {canContact && (
                            <td className="px-2.5 py-1.5">
                              <div className="flex items-center justify-end gap-0.5">
                                <RowActionIcon
                                  icon={<MessageIcon className="h-4 w-4" />}
                                  title="Message"
                                  onClick={e => openContactFlyout(person, 'message', e.currentTarget)}
                                />
                                <RowActionIcon
                                  icon={<PhoneIcon className="h-4 w-4" />}
                                  title="Call"
                                  onClick={e => openContactFlyout(person, 'call', e.currentTarget)}
                                />
                                <RowActionIcon
                                  icon={<EmailIcon className="h-4 w-4" />}
                                  title="Mail"
                                  href={targetEmail && person.email_verified ? `mailto:${targetEmail}` : null}
                                  onMissing={() => contactMissing(firstNameForMissing)}
                                />
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ))}
    </div>
  )
}
