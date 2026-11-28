import SectionLabel from '../../components/SectionLabel'
import ClearableInput from '../../components/ClearableInput'
import PhoneIcon from '../../components/icons/PhoneIcon'
import EmailIcon from '../../components/icons/EmailIcon'
import { formatPhoneDisplay, formatPhoneProgressive, phoneTelHref } from '../../lib/phone'
import { TEMP_PASSWORD_VALIDITY_DAYS } from '../../lib/tempPassword'
import ContactRow from './ContactRow'

// Contact Details: the mobile number and email rows. Moved out of AccountSettingsPage as it was.
export default function ContactDetailsSection({
  profile, isOwnAccount, isAdmin, phone, setPhone, phoneEditing, setPhoneEditing, cancelPhoneEdit, savePhone,
  phoneSaving, phoneDirty, phoneJustSaved, phoneMsg, displayEmail, emailEditing, setEmailEditing, cancelEmailEdit,
  adminEmailDialog, canAdminChangeEmail, askAdminEmailChange, newEmail, setNewEmail, adminEmailSend,
  setAdminEmailSend, adminEmailDirty, emailMsg, changeEmail, emailSaving, emailDirty,
}) {
  return (
    <div>
      <SectionLabel>Contact Details</SectionLabel>
      {/* pt-[3px] pb-[5px] on the phone/email inputs below (same 8px
          total as the display <p>'s py-1, just redistributed) nudges
          their text up ~1px — browsers vertically center text inside an
          <input> using the font's own internal form-control metrics
          rather than the plain CSS line-height box a <p> uses, so even
          with an identical border+padding box the two can render the
          text a hair off from each other. */}
      <div className="card overflow-hidden divide-y divide-slate-line">
        <ContactRow
          icon={<PhoneIcon className="h-5 w-5" />}
          value={formatPhoneDisplay(profile.phone)}
          href={!isOwnAccount ? phoneTelHref(profile.phone) : null}
          editLabel="Edit mobile number"
          editing={phoneEditing}
          onToggle={() => (phoneEditing ? cancelPhoneEdit() : setPhoneEditing(true))}
          editable={isOwnAccount || isAdmin}
        >
          <form onSubmit={savePhone} className="space-y-2">
            <ClearableInput
              type="tel"
              value={formatPhoneProgressive(phone)}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              onClear={() => setPhone('')}
              placeholder="e.g. (082) 123 4567"
              className="input-field"
              clearLabel="Clear mobile number"
            />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={phoneSaving || !phoneDirty} className="btn-primary">
                {phoneSaving ? 'Saving…' : phoneJustSaved ? 'Saved.' : 'Update'}
              </button>
              <button type="button" onClick={cancelPhoneEdit} className="btn-secondary">
                Cancel
              </button>
              {phoneMsg && (
                <span className="text-xs font-medium text-flagRed">{phoneMsg.text}</span>
              )}
            </div>
          </form>
        </ContactRow>

        <ContactRow
          icon={<EmailIcon className="h-5 w-5" />}
          value={displayEmail}
          href={!isOwnAccount && displayEmail ? `mailto:${displayEmail}` : null}
          editLabel="Edit email address"
          editing={emailEditing}
          onToggle={() => {
            // Escape while the confirmation is up belongs to the dialog,
            // not to the form behind it.
            if (adminEmailDialog) return
            emailEditing ? cancelEmailEdit() : setEmailEditing(true)
          }}
          editable={isOwnAccount || canAdminChangeEmail}
          verified={profile?.email_verified}
        >
          {canAdminChangeEmail ? (
          <form onSubmit={askAdminEmailChange} className="space-y-2" noValidate>
            <ClearableInput
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="input-field"
              clearLabel="Clear email address"
              aria-label="New email address"
            />
            <p className="text-xs text-ink-muted">
              This is their login username. The change takes effect immediately. No confirmation email is sent.
            </p>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={adminEmailSend}
                onChange={e => setAdminEmailSend(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
              />
              <span className="min-w-0">
                <span className="block text-sm text-ink">Send login details to the new address</span>
                <span className="block text-xs text-ink-muted">
                  Issues a new temporary password, valid for {TEMP_PASSWORD_VALIDITY_DAYS} days. Their current password stops working.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!adminEmailDirty} className="btn-primary">
                Save
              </button>
              <button type="button" onClick={cancelEmailEdit} className="btn-secondary">
                Cancel
              </button>
              {emailMsg && (
                <span role="alert" className="text-xs font-medium text-flagRed">{emailMsg.text}</span>
              )}
            </div>
          </form>
          ) : (
          <form onSubmit={changeEmail} className="space-y-2">
            <ClearableInput
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="input-field"
              clearLabel="Clear email address"
            />
            <p className="text-xs text-ink-muted">
              This is also your login username. Changing it sends confirmation links to both your old and new address —
              the change only takes effect once confirmed, so it won&apos;t lock you out.
            </p>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={emailSaving || !emailDirty} className="btn-primary">
                {emailSaving ? 'Sending…' : 'Update'}
              </button>
              <button type="button" onClick={cancelEmailEdit} className="btn-secondary">
                Cancel
              </button>
              {emailMsg && (
                <span className={`text-xs font-medium ${emailMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                  {emailMsg.text}
                </span>
              )}
            </div>
          </form>
          )}
        </ContactRow>
      </div>
    </div>
  )
}
