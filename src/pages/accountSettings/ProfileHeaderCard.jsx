import { useRef, useState } from 'react'
import ProfileAvatar, { StatusPicker } from '../../components/ProfileAvatar'
import ClearableInput from '../../components/ClearableInput'
import SelectMenu from '../../components/SelectMenu'
import { useDismissablePopover } from '../../lib/useDismissablePopover'
import { DAY_OPTIONS, MONTH_OPTIONS, formatBirthdayDisplay } from './accountSettingsHelpers'
import EditIconButton from './EditIconButton'

// The profile header (see the comment where AccountSettingsPage renders it):
// avatar with its photo menu and status, name, role and status line, and
// the name / birthday form it opens. Its open/closed state is its own.
// Moved out of AccountSettingsPage as it was.
export default function ProfileHeaderCard({
  profile, isOwnAccount, isAdmin, avatarError, deleteAvatar, handleAvatarSelect, adminIsActive, isOnLeave,
  roleCategoryLabel, permissionLabel, form, setForm, setBirthdayPart, saveProfile, savingProfile, profileDirty,
  profileJustSaved, profileMsg,
}) {
  const fileInputRef = useRef(null)
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false)
  // Whether the profile header's details panel exists at all — an admin can
  // edit a colleague's, a doctor only their own. Everyone else gets a header
  // that is a plain summary, with nothing to expand and so nothing to tap.
  const canEditProfileDetails = isOwnAccount || isAdmin
  const profileHeaderRef = useRef(null)
  useDismissablePopover(profileDetailsOpen, () => setProfileDetailsOpen(false), profileHeaderRef)
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const photoMenuRef = useRef(null)
  useDismissablePopover(photoMenuOpen, () => setPhotoMenuOpen(false), photoMenuRef)

  return (
    <div className="card" ref={profileHeaderRef}>
      {/* The whole row expands the details, not just the chevron — the
          SectionRow accordions below already work that way, and this one
          looked inert by comparison. The padding moves off the card and
          onto this row so the background feedback covers the full panel;
          the corner rounding follows, since the card can't clip it
          (no overflow-hidden, see above). */}
      <div
        onClick={canEditProfileDetails ? () => setProfileDetailsOpen(o => !o) : undefined}
        className={`flex items-center justify-between gap-3 rounded-t-lg px-5 py-3 transition-colors ${
          profileDetailsOpen || avatarError ? '' : 'rounded-b-lg'
        } ${canEditProfileDetails ? 'cursor-pointer hover:bg-canvas-sunken active:bg-canvas-sunken' : ''}`}
      >
        {/* The avatar's own menu button, the status picker and the file
            input all live in here — their clicks are their own, not the
            row's. */}
        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          <div className="relative flex-shrink-0">
            {/* Scoped to just the avatar button + its own dropdown — not the
                StatusPicker below, which needs to be a DOM sibling (not a
                descendant) of this ref so clicking it counts as an "outside"
                click that closes this menu, instead of being swallowed as
                "inside" it. Without that split, the photo menu and the status
                menu could both end up open at once. */}
            <div ref={photoMenuRef} className="contents">
              <button
                type="button"
                onClick={() => isOwnAccount && setPhotoMenuOpen(o => !o)}
                aria-label={isOwnAccount ? 'Edit profile picture' : undefined}
                aria-haspopup={isOwnAccount ? 'menu' : undefined}
                aria-expanded={isOwnAccount ? photoMenuOpen : undefined}
                disabled={!isOwnAccount}
                className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
                  isOwnAccount ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <ProfileAvatar profile={profile} size={44} />
              </button>
              {isOwnAccount && photoMenuOpen && (
                <div className="absolute left-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-lg border border-edge bg-canvas-raised shadow-raised">
                  <button
                    type="button"
                    onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click() }}
                    className="block w-full px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
                  >
                    Upload picture
                  </button>
                  {profile.avatar_url && (
                    <button
                      type="button"
                      onClick={() => { setPhotoMenuOpen(false); deleteAvatar() }}
                      className="block w-full px-3 py-2.5 text-left text-sm text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg"
                    >
                      Delete picture
                    </button>
                  )}
                </div>
              )}
            </div>
            <StatusPicker
              active={adminIsActive}
              onLeave={isOnLeave}
              size={14}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* Not the page's H1 — PageHeader above already carries that
              ("Account"). This is the specific profile being viewed
              (which may not be the viewer's own, e.g. an admin
              reviewing a colleague's account), so it stays its own
              prominent line without claiming the page-title role. */}
          <p className="font-display text-lg font-bold leading-tight text-ink">{profile.name} {profile.surname}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {roleCategoryLabel}
            {permissionLabel && (
              <>
                {' · '}
                <span className={`font-medium ${profile.is_super_admin ? 'text-flagBlue' : 'text-accent'}`}>
                  {permissionLabel}
                </span>
              </>
            )}
            {/* Status as text, not colour alone — matches the same
                Active/On leave/Inactive wording used on the Staff list. */}
            {' · '}
            <span className={`font-medium ${!adminIsActive ? 'text-flagRed' : isOnLeave ? 'text-ink-muted' : 'text-success'}`}>
              {!adminIsActive ? 'Inactive' : isOnLeave ? 'On leave' : 'Active'}
            </span>
          </p>
        </div>

        {canEditProfileDetails && (
          <EditIconButton
            label="Edit profile details"
            expanded={profileDetailsOpen}
            onClick={() => setProfileDetailsOpen(o => !o)}
          />
        )}
      </div>
      {avatarError && <p className="px-5 pb-3 text-xs text-flagRed">{avatarError}</p>}

      {profileDetailsOpen && canEditProfileDetails && (
        <div className="border-t border-slate-line px-5 py-5">
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="label-text">First name</label>
              <ClearableInput
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="input-field"
                clearLabel="Clear first name"
              />
            </div>
            <div>
              <label className="label-text">Surname</label>
              <ClearableInput
                type="text"
                value={form.surname}
                onChange={e => setForm(f => ({ ...f, surname: e.target.value }))}
                className="input-field"
                clearLabel="Clear surname"
              />
            </div>
            <div>
              <label className="label-text">Birthday</label>
              {/* Day + month only — no year, since this only ever needs to
                  recur annually. SelectMenu (not a native date input)
                  also sidesteps the iOS Safari bug where native date
                  inputs can render wider than their box regardless of
                  CSS width. */}
              <div className="flex gap-2">
                <SelectMenu
                  value={form.birthdayDay}
                  onChange={v => setBirthdayPart('day', v)}
                  placeholder="Day"
                  options={DAY_OPTIONS}
                />
                <SelectMenu
                  value={form.birthdayMonth}
                  onChange={v => setBirthdayPart('month', v)}
                  placeholder="Month"
                  options={MONTH_OPTIONS}
                />
              </div>
              {!isOwnAccount && formatBirthdayDisplay(profile.birthday) && (
                <p className="mt-1 text-xs text-ink-muted">Currently: {formatBirthdayDisplay(profile.birthday)}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={savingProfile || !profileDirty} className="btn-primary">
                {savingProfile ? 'Saving…' : profileJustSaved ? 'Saved.' : 'Update'}
              </button>
              {profileMsg && (
                <span className="text-xs font-medium text-flagRed">{profileMsg.text}</span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
