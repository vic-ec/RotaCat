import { computeAnchoredPosition } from '../../lib/popoverPosition'
import { QuickActionRow } from '../../components/ContactQuickMenu'
import PhoneIcon from '../../components/icons/PhoneIcon'
import EmailIcon from '../../components/icons/EmailIcon'
import { MessageIcon } from './icons'

// A row's quick-action menu (see the comment where StaffListPage renders
// it). Moved out of StaffListPage as it was.
export default function QuickActionMenu({
  isAdmin, navigate, setRegeneratePasswordFor, emailById, quickActionPerson, quickActionAnchor, secondaryFor,
  quickActionMenuRef, requestToggleActive, closeQuickActions, toggleSecondary, contactMissing,
}) {
  const targetEmail = emailById[quickActionPerson.id]
  const mailHref = targetEmail ? `mailto:${targetEmail}` : null

  const menuWidth = 224
  const positionStyle = computeAnchoredPosition(quickActionAnchor, menuWidth)

  function missing() {
    return () => { contactMissing(quickActionPerson.name || quickActionPerson.surname || 'this person'); closeQuickActions() }
  }

  return (
    <div
      ref={quickActionMenuRef}
      role="menu"
      style={{ ...positionStyle, width: menuWidth }}
      className="fixed z-50 overflow-hidden rounded-xl border border-edge bg-canvas-raised py-1 shadow-raised"
    >
      <QuickActionRow
        icon={<MessageIcon className="h-5 w-5" />}
        label="Message"
        expandable
        expanded={secondaryFor === 'message'}
        onClick={e => toggleSecondary('message', e.currentTarget)}
      />
      <QuickActionRow
        icon={<PhoneIcon className="h-5 w-5" />}
        label="Call"
        expandable
        expanded={secondaryFor === 'call'}
        onClick={e => toggleSecondary('call', e.currentTarget)}
      />
      <QuickActionRow
        icon={<EmailIcon className="h-5 w-5" />}
        label="Mail"
        href={mailHref}
        onClick={mailHref ? closeQuickActions : missing('Mail')}
      />
      {isAdmin && quickActionPerson.role === 'doctor' && quickActionPerson.is_approved !== false && (
        <QuickActionRow
          label={`${quickActionPerson.name || quickActionPerson.surname || 'Their'}’s year`}
          onClick={() => { const id = quickActionPerson.id; closeQuickActions(); navigate(`/my-year/${id}`) }}
        />
      )}
      {isAdmin && (
        <QuickActionRow
          label="Update status"
          onClick={() => { requestToggleActive(quickActionPerson); closeQuickActions() }}
        />
      )}
      {/* For anyone who lost the welcome email their account was
          created with, or never got it — issues a fresh password
          and emails it. Admin-only, and confirmed in the modal
          before anything is invalidated. */}
      {isAdmin && (
        <QuickActionRow
          label="Regenerate password"
          onClick={() => { setRegeneratePasswordFor(quickActionPerson); closeQuickActions() }}
        />
      )}
    </div>
  )
}
