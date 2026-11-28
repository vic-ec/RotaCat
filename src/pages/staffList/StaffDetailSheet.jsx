import { Eye, CircleCheck, ShieldAlert } from 'lucide-react'
import { ContactFlyout } from '../../components/ContactQuickMenu'
import PhoneIcon from '../../components/icons/PhoneIcon'
import EmailIcon from '../../components/icons/EmailIcon'
import { leaveTypeInk } from '../../lib/leaveMatrix'
import { formatPhoneDisplay } from '../../lib/phone'
import { formatShortDateRange } from '../../lib/dateRange'
import { isTempPasswordExpired, tempPasswordExpiresAt, formatExpiryDate } from '../../lib/tempPassword'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import SheetActionButton from './SheetActionButton'
import { MessageIcon } from './icons'

// The phone detail sheet a row tap opens (see the comment where
// StaffListPage renders it). Moved out of StaffListPage as it was.
export default function StaffDetailSheet({
  isAdmin, navigate, emailById, leaveProfileIds, leaveDatesById, neverSignedInIds, detailSheetPerson,
  sheetFlyout, setSheetFlyout, detailSheetRef, closeDetailSheet, toggleSheetFlyout, detailSheetSwipe,
  activeUntilFor, contactMissing,
}) {
  const person = detailSheetPerson
  const secondaryLabel = person.role === 'doctor'
    ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
    : (ROLE_LABELS[person.role] || person.role)
  const formattedPhone = formatPhoneDisplay(person.phone)
  const targetEmail = emailById[person.id]
  const onLeave = leaveProfileIds.has(person.id)
  const statusLabel = !person.is_active
    ? (person.scheduled_active_date ? `Starts ${formatShortDateRange(person.scheduled_active_date, person.scheduled_active_date)}` : 'Inactive')
    : onLeave ? 'On leave'
    : activeUntilFor(person) ? `Active until ${formatShortDateRange(activeUntilFor(person), activeUntilFor(person))}`
    : 'Active'
  const statusColor = !person.is_active ? 'text-flagRed' : onLeave ? 'text-statusAway' : 'text-success'
  const firstNameForMissing = person.name || person.surname || 'this person'

  return (
    <>
    <div className="fixed inset-0 z-40 scrim md:hidden" aria-hidden="true" />
    <div
      ref={detailSheetRef}
      role="dialog"
      aria-modal="true"
      style={detailSheetSwipe.style}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-edge bg-canvas-raised px-5 pb-6 pt-3 shadow-raised md:hidden"
    >
      <div {...detailSheetSwipe.handleProps} className="touch-none">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-line" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{person.name ? `${person.name} ` : ''}{person.surname}</p>
            <p className="line-clamp-2 text-sm text-ink-muted">{secondaryLabel}</p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
            {person.is_active && onLeave && leaveDatesById[person.id] && (
              <span className="whitespace-nowrap text-xs font-medium" style={{ color: leaveTypeInk(leaveDatesById[person.id][2]) }}>{formatShortDateRange(leaveDatesById[person.id][0], leaveDatesById[person.id][1])}</span>
            )}
            {isAdmin && person.must_change_password && (
              <span className={`flex items-center gap-1 text-right text-xs font-medium ${person.is_active && !neverSignedInIds.has(person.id) && !isTempPasswordExpired(person) ? 'whitespace-nowrap text-ink-muted' : 'text-rose'}`}>
                <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                {isTempPasswordExpired(person)
                  ? `Temp password expired ${formatExpiryDate(tempPasswordExpiresAt(person.temp_password_issued_at))}`
                  : person.is_active && !neverSignedInIds.has(person.id) ? 'Temp password in use' : 'Account created; not signed in'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-slate-line pt-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-14 flex-shrink-0 text-ink-muted">Mobile</span>
          <span className="min-w-0 truncate text-ink">{formattedPhone || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 flex-shrink-0 text-ink-muted">Email</span>
          <span className="min-w-0 truncate text-ink">{targetEmail || '—'}</span>
          {targetEmail && person.email_verified && <CircleCheck className="h-3.5 w-3.5 flex-shrink-0 text-success" />}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {/* Message and Call open the quick-action menu's flyout:
            Mobile and WhatsApp. */}
        <SheetActionButton
          icon={<MessageIcon className="h-5 w-5" />}
          label="Message"
          expanded={sheetFlyout?.section === 'message'}
          onClick={e => toggleSheetFlyout('message', e.currentTarget)}
        />
        <SheetActionButton
          icon={<PhoneIcon className="h-5 w-5" />}
          label="Call"
          expanded={sheetFlyout?.section === 'call'}
          onClick={e => toggleSheetFlyout('call', e.currentTarget)}
        />
        <SheetActionButton
          icon={<EmailIcon className="h-5 w-5" />}
          label="Email"
          href={targetEmail && person.email_verified ? `mailto:${targetEmail}` : null}
          onClick={closeDetailSheet}
          onMissing={() => contactMissing(firstNameForMissing)}
        />
        <SheetActionButton
          icon={<Eye className="h-5 w-5" />}
          label="View Account"
          onClick={() => { closeDetailSheet(); navigate(`/account/${person.id}`) }}
        />
      </div>
    </div>
    {sheetFlyout && (
      <ContactFlyout
        section={sheetFlyout.section}
        anchor={sheetFlyout.anchor}
        phone={person.phone}
        onPicked={closeDetailSheet}
        onMissing={() => { contactMissing(firstNameForMissing); setSheetFlyout(null) }}
      />
    )}
    </>
  )
}
