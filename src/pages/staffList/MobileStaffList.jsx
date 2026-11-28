import { ChevronDown as ChevronDownIcon } from 'lucide-react'
import ProfileAvatar, { StatusPicker } from '../../components/ProfileAvatar'
import TempPasswordIndicator from '../../components/TempPasswordIndicator'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import { CONTRACT_TAG_TITLE, PERMISSION_LABELS, contractTagText } from './staffListHelpers'
import { KebabIcon } from './icons'

// The staff list below `md`: stacked rows, grouped. Moved out of StaffListPage as it was.
export default function MobileStaffList({
  isAdmin, canContact, stickyHeaderHeight, leaveProfileIds, neverSignedInIds, collapsedGroups,
  toggleGroupCollapsed, handleRowPointerDown, handleRowTouchEnd, cancelLongPress, handleRowClick,
  toggleQuickActions, groups,
}) {
  return (
    <div className="md:hidden">
      {groups.map(group => (
        <div key={group.key} className="mb-4 last:mb-0">
          {group.label && (() => {
            const activeCount = group.items.filter(p => p.is_active).length
            const inactiveCount = group.items.length - activeCount
            return (
            <button
              onClick={() => toggleGroupCollapsed(group.key)}
              // Sticks flush against the real bottom edge of the
              // header above (stickyHeaderRef/stickyHeaderHeight,
              // see that ref's own comment) — measured rather than
              // a hand-picked constant, so it can't drift out of
              // sync with that header's actual rendered height
              // (admin vs non-admin, or any future change to what
              // renders inside it) the way a fixed px offset here
              // already has twice before.
              style={{ top: stickyHeaderHeight }}
              className="sheen-divider sheen-pinned sticky z-[5] mb-2 transition-[filter] hover:brightness-110 active:brightness-110"
            >
              {/* "X active · Y inactive" instead of "X total · Y
                  active" — surfaces the exception (anyone inactive)
                  immediately instead of burying it in a total. */}
              <span>{group.label} <span className="divider-meta ml-2 normal-case font-normal">{activeCount} active · {inactiveCount} inactive</span></span>
              <ChevronDownIcon className={`divider-meta h-3.5 w-3.5 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
            </button>
            )
          })()}
          {(!group.label || !collapsedGroups[group.key]) && (
          <div className="card divide-y divide-slate-line overflow-hidden">
            {group.items.map(person => {
              // Category alone for a doctor (every role in this app
              // implies "doctor" except locum/clerk, so spelling it
              // out is redundant) — matches the desktop table and
              // every other row style in this file.
              const secondaryLabel = person.role === 'doctor'
                ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
                : (ROLE_LABELS[person.role] || person.role)
              const contractTag = contractTagText(person)
              return (
                <div
                  key={person.id}
                  onClick={() => handleRowClick(person)}
                  onPointerDown={e => handleRowPointerDown(e, person)}
                  onPointerUp={cancelLongPress}
                  onTouchEnd={handleRowTouchEnd}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onContextMenu={e => { if (canContact) e.preventDefault() }}
                  // No fade on an inactive account — the red
                  // "Inactive" chip below is the signal. Dimming
                  // the whole row made the name and contact
                  // details harder to read for no extra meaning.
                  className={`flex items-center gap-3 px-4 py-1 transition-colors hover:bg-canvas-sunken ${canContact ? 'cursor-pointer no-callout active:bg-slate-line' : ''}`}
                >
                  <div className="relative flex-shrink-0">
                    <ProfileAvatar profile={person} size={40} />
                    <StatusPicker
                      active={person.is_active}
                      onLeave={leaveProfileIds.has(person.id)}
                      size={14}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {person.name ? `${person.name} ` : ''}{person.surname}
                    </span>
                    {/* line-clamp-2, not truncate: a long category
                        combo (e.g. "COSMO (Psych)") wraps to a
                        second line instead of silently cutting
                        off. */}
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                      <span className="line-clamp-2">{secondaryLabel}</span>
                      {contractTag && (
                        <span
                          className="chip-mint flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold"
                          title={CONTRACT_TAG_TITLE[person.contract_type]}
                        >
                          {contractTag}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Chips, then the temp-password shield in a slot
                      of its own just left of the kebab. The shield
                      used to sit between the Admin and Inactive
                      chips in one right-aligned run, so it landed
                      beside the kebab on one row and a chip's width
                      further left on the next. The slot is reserved
                      on every row an admin sees (only admins ever
                      get the shield), which also keeps the chips
                      themselves lined up down the list. An inactive
                      admin's two chips sit side by side on one line
                      (the name truncates to make room). */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <div className="flex items-center gap-1">
                      {isAdmin && person.is_admin && (
                        <span className={`flex items-center whitespace-nowrap rounded-md border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-normal ${
                          person.is_super_admin ? 'border-flagBlue text-flagBlue' : 'border-accent text-accent'
                        }`}>
                          {person.is_super_admin ? PERMISSION_LABELS.super_admin : PERMISSION_LABELS.admin}
                        </span>
                      )}
                      {!person.is_active && (
                        <span className="flex items-center whitespace-nowrap rounded-md border border-flagRed/40 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-normal text-flagRed">
                          Inactive
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <span className="flex w-5 flex-shrink-0 justify-center">
                        {person.must_change_password && <TempPasswordIndicator notSignedIn={!person.is_active || neverSignedInIds.has(person.id)} person={person} />}
                      </span>
                    )}
                  </div>
                  {canContact && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleQuickActions(person, e.currentTarget) }}
                      aria-label="Quick actions"
                      aria-haspopup="menu"
                      title="Quick actions"
                      // The visible dot stays small (keeps the row
                      // compact), but the actual tappable area is
                      // expanded to 44px via this invisible ::after
                      // — a real 44px button here would fight the
                      // shorter-row goal by becoming the row's
                      // tallest element instead of the avatar.
                      className="relative flex-shrink-0 rounded p-1.5 text-ink-muted transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
                    >
                      <KebabIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          )}
        </div>
      ))}
    </div>
  )
}
