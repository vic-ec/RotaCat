import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ExternalLink, CalendarClock, Grid2x2Check, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import SectionLabel from '../components/SectionLabel'
import { NEUTRAL_AVATAR_COLOR } from '../lib/color'
import StatusChangeConfirmModal from '../components/StatusChangeConfirmModal'
import LogoutIcon from '../components/icons/LogoutIcon'
import { ROLE_LABELS } from '../lib/usePendingApprovalReview'
import { CATEGORY_LABELS, NOTIFICATION_ORDER, birthdayToDayMonth } from './accountSettings/accountSettingsHelpers'
import AvatarCropModal from './accountSettings/AvatarCropModal'
import { useAccountTarget } from './accountSettings/useAccountTarget'
import { useProfileForm } from './accountSettings/useProfileForm'
import { useAccountEmail } from './accountSettings/useAccountEmail'
import { usePhoneNumber } from './accountSettings/usePhoneNumber'
import { useAvatarUpload } from './accountSettings/useAvatarUpload'
import { useNotificationPrefs } from './accountSettings/useNotificationPrefs'
import { useAppearance } from './accountSettings/useAppearance'
import { usePasswordChange } from './accountSettings/usePasswordChange'
import { useAdminAccountFields } from './accountSettings/useAdminAccountFields'
import { useAnnualLeaveDays } from './accountSettings/useAnnualLeaveDays'
import { useSuperAdminTransfer } from './accountSettings/useSuperAdminTransfer'
import { useChangeRequests } from './accountSettings/useChangeRequests'
import { useAdminDeleteAccount } from './accountSettings/useAdminDeleteAccount'
import ProfileHeaderCard from './accountSettings/ProfileHeaderCard'
import ContactDetailsSection from './accountSettings/ContactDetailsSection'
import ChangePasswordSection from './accountSettings/ChangePasswordSection'
import RoleAccessSection from './accountSettings/RoleAccessSection'
import RegeneratePasswordSection from './accountSettings/RegeneratePasswordSection'
import RequestHistorySection from './accountSettings/RequestHistorySection'
import AppearanceSection from './accountSettings/AppearanceSection'
import ColourThemeSection from './accountSettings/ColourThemeSection'
import NotificationsSection from './accountSettings/NotificationsSection'
import AdminDeleteAccountSection from './accountSettings/AdminDeleteAccountSection'
import OwnDeleteAccountSection from './accountSettings/OwnDeleteAccountSection'
import AdminEmailDialogs from './accountSettings/AdminEmailDialogs'

// The Account page. Its sections, and the loading and saving hooks behind
// each, live in ./accountSettings/.
export default function AccountSettingsPage() {
  const { user, profile: myProfile, isAdmin, isSuperAdmin, refreshProfile, signOut } = useAuth()
  const { id: routeId } = useParams()
  const navigate = useNavigate()

  // Viewing someone else's account requires admin permission — enforced below via redirect.
  const targetId = routeId || user?.id
  const isOwnAccount = !routeId || routeId === user?.id

  const { targetProfile, targetLoadError, targetEmail, setTargetEmail, reloadTarget, isOnLeave } =
    useAccountTarget({ isOwnAccount, targetId, refreshProfile })

  const profile = isOwnAccount ? myProfile : targetProfile

  const { form, setForm, savingProfile, profileJustSaved, profileMsg, setBirthdayPart, profileDirty, saveProfile } =
    useProfileForm({ profile, targetId, reloadTarget })
  const {
    newEmail, setNewEmail, emailSaving, emailMsg, emailEditing, setEmailEditing, canAdminChangeEmail,
    adminEmailSend, setAdminEmailSend, adminEmailDialog, setAdminEmailDialog, adminEmailSaving, emailDirty,
    changeEmail, cancelEmailEdit, adminEmailDirty, askAdminEmailChange, confirmAdminEmailChange,
  } = useAccountEmail({ user, isOwnAccount, isSuperAdmin, targetId, targetEmail, setTargetEmail, reloadTarget })
  const { phone, setPhone, phoneSaving, phoneJustSaved, phoneMsg, phoneEditing, setPhoneEditing, phoneDirty, savePhone, cancelPhoneEdit } =
    usePhoneNumber({ profile, targetId, reloadTarget })
  const { cropSrc, setCropSrc, uploadingAvatar, avatarError, handleAvatarSelect, confirmCrop, deleteAvatar } =
    useAvatarUpload({ user, refreshProfile })
  const { prefs, setPrefs, showAdvancedNotifications, setShowAdvancedNotifications, togglePrefs } = useNotificationPrefs({ user })
  const {
    colorForm, setColorForm, colorSaving, colorJustSaved, surprising, colorMsg, pickColorSwatch, surpriseMe,
    saveAppearance, cancelAppearance, isColorDirty, appearancePreviewColor,
  } = useAppearance({ user, profile, refreshProfile })
  const { pwForm, setPwForm, pwCapsLock, pwSaving, pwJustSaved, pwMsg, pwDirty, changePassword, resetPasswordForm } =
    usePasswordChange({ user })
  const {
    adminRole, setAdminRole, adminCategory, setAdminCategory, adminContractType, setAdminContractType,
    adminSubtype, setAdminSubtype, adminIsAdmin, setAdminIsAdmin, adminIsActive, setAdminIsActive, adminEcStart,
    setAdminEcStart, adminSaving, adminJustSaved, adminMsg, statusMsg, statusConfirmNextActive,
    setStatusConfirmNextActive, statusConfirmSaving, handleAdminRoleChange, handleAdminCategoryChange,
    adminFieldsDirty, saveAdminAccountFields, confirmStatusChange,
  } = useAdminAccountFields({ profile, targetId, user, reloadTarget })
  const {
    currentYear, annualLeaveDays, setAnnualLeaveDays, annualLeaveDaysLoaded, annualLeaveDaysSaving,
    annualLeaveDaysJustSaved, annualLeaveDaysMsg, saveAnnualLeaveDays,
  } = useAnnualLeaveDays({ targetId, isAdmin })
  const {
    otherAdmins, transferTargetId, setTransferTargetId, transferConfirming, setTransferConfirming, transferSaving,
    transferMsg, transferSuperAdmin,
  } = useSuperAdminTransfer({ isSuperAdmin, user, isOwnAccount, refreshProfile })
  const {
    myRequests, requestForm, setRequestForm, requestSaving, requestMsg, deleteConfirming, setDeleteConfirming,
    deleteSaving, pendingDeletion, pendingRoleOrCategory, submitChangeRequest, requestDeletion,
  } = useChangeRequests({ user, profile })
  const {
    adminDeleteConfirming, setAdminDeleteConfirming, adminDeleting, adminDeleteError, adminDeleteTyped,
    setAdminDeleteTyped, adminDeleteCountdown, adminDeleteSurnameMatches, resetAdminDelete,
    startAdminDeleteCountdown, undoAdminDelete,
  } = useAdminDeleteAccount({ profile, targetId, navigate })

  // Every form on the page starts from the profile being viewed.
  useEffect(() => {
    if (!profile) return
    const { day, month } = birthdayToDayMonth(profile.birthday)
    setForm({
      name: profile.name || '',
      surname: profile.surname || '',
      birthdayDay: day,
      birthdayMonth: month,
    })
    setPhone(profile.phone || '')
    setPrefs(profile.notification_prefs || {})
    setAdminRole(profile.role || '')
    setAdminCategory(profile.category || '')
    setAdminContractType(profile.contract_type || 'full')
    setAdminSubtype(profile.psych_subcategory || null)
    setAdminIsAdmin(profile.is_admin === true)
    setAdminIsActive(profile.is_active !== false)
    setAdminEcStart(profile.ec_start_date || '')
    setColorForm({ colorCode: profile.color_code || NEUTRAL_AVATAR_COLOR })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters come from useState inside the hooks above, so they never change
  }, [profile])

  if (!isOwnAccount && targetLoadError) {
    return (
      <div className="mx-auto max-w-7xl pb-12 md:max-w-2xl">
        <div className="card border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">{targetLoadError}</p>
          <Link to="/staff" className="btn-secondary mt-3 inline-block">Back to Staff list</Link>
        </div>
      </div>
    )
  }

  if (!profile) return <p className="text-sm text-ink-muted">Loading…</p>

  const displayEmail = isOwnAccount ? user.email : targetEmail
  const targetFullName = `${profile?.name || ''} ${profile?.surname || ''}`.trim() || 'This person'

  const visibleNotificationKeys = NOTIFICATION_ORDER.filter(key => key in prefs)
  const allNotificationsOn = visibleNotificationKeys.length > 0 &&
    visibleNotificationKeys.every(key => prefs[key] !== false)

  const roleCategoryLabel = profile.role === 'doctor'
    ? (CATEGORY_LABELS[profile.category] || profile.category || '—')
    : (ROLE_LABELS[profile.role] || profile.role)
  const permissionLabel = profile.is_admin ? (profile.is_super_admin ? 'Super-admin' : 'Admin') : null


  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-7xl pb-12 md:max-w-2xl">
      <PageHeader title="Account" />
      {/* Back: the app-wide back link above the title (AppLayout), the one
          standard place for it; this page draws none of its own. */}

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          saving={uploadingAvatar}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null) }}
          onConfirm={confirmCrop}
        />
      )}

      <div className="space-y-6">
        {/* ── Profile header: its own panel — avatar, name, role/category, status + admin ──
             No overflow-hidden here (unlike the row-group cards below): this card has no
             flush edge-to-edge children needing corner-clipping, and clipping it would cut
             off the avatar's photo-menu dropdown when the card is short. ── */}
        <ProfileHeaderCard
          profile={profile} isOwnAccount={isOwnAccount} isAdmin={isAdmin} avatarError={avatarError}
          deleteAvatar={deleteAvatar} handleAvatarSelect={handleAvatarSelect} adminIsActive={adminIsActive}
          isOnLeave={isOnLeave} roleCategoryLabel={roleCategoryLabel} permissionLabel={permissionLabel} form={form}
          setForm={setForm} setBirthdayPart={setBirthdayPart} saveProfile={saveProfile} savingProfile={savingProfile}
          profileDirty={profileDirty} profileJustSaved={profileJustSaved} profileMsg={profileMsg}
        />

        {/* ── Contact details ───────────────────────────────────── */}
        <ContactDetailsSection
          profile={profile} isOwnAccount={isOwnAccount} isAdmin={isAdmin} phone={phone} setPhone={setPhone}
          phoneEditing={phoneEditing} setPhoneEditing={setPhoneEditing} cancelPhoneEdit={cancelPhoneEdit}
          savePhone={savePhone} phoneSaving={phoneSaving} phoneDirty={phoneDirty} phoneJustSaved={phoneJustSaved}
          phoneMsg={phoneMsg} displayEmail={displayEmail} emailEditing={emailEditing} setEmailEditing={setEmailEditing}
          cancelEmailEdit={cancelEmailEdit} adminEmailDialog={adminEmailDialog} canAdminChangeEmail={canAdminChangeEmail}
          askAdminEmailChange={askAdminEmailChange} newEmail={newEmail} setNewEmail={setNewEmail}
          adminEmailSend={adminEmailSend} setAdminEmailSend={setAdminEmailSend} adminEmailDirty={adminEmailDirty}
          emailMsg={emailMsg} changeEmail={changeEmail} emailSaving={emailSaving} emailDirty={emailDirty}
        />

        {/* ── My year: leave record, shifts, public holidays, attendance.
            Doctors only — locums and clerks have no such page. ── */}
        {profile?.role === 'doctor' && profile?.is_approved && (isOwnAccount || isAdmin) && (
          <div>
            <SectionLabel>{isOwnAccount ? 'My Year' : `${profile.name || profile.surname}’s Year`}</SectionLabel>
            {/* Laid out like the rows in the panels below (icon, text-sm
                title, a 16px chevron in the same box), but a right chevron
                rather than their up/down one: this row goes to another page,
                theirs open in place. */}
            <Link
              to={isOwnAccount ? '/my-year' : `/my-year/${profile.id}`}
              className="card flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
            >
              <span className="flex-shrink-0 text-ink-light" aria-hidden="true"><Grid2x2Check className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">Leave, shifts &amp; attendance record</span>
              <span className="flex-shrink-0 rounded p-1 text-ink-muted" aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
            </Link>
          </div>
        )}

        {/* ── Security & access ─────────────────────────────────── */}
        <div>
        <SectionLabel>Security &amp; Access</SectionLabel>
        <div className="card overflow-hidden divide-y divide-slate-line">
          {/* ── Change password (own account only) ──────────────── */}
          {isOwnAccount && (
            <ChangePasswordSection
              pwForm={pwForm} setPwForm={setPwForm} pwCapsLock={pwCapsLock} changePassword={changePassword}
              resetPasswordForm={resetPasswordForm} pwSaving={pwSaving} pwDirty={pwDirty} pwJustSaved={pwJustSaved} pwMsg={pwMsg}
            />
          )}

          {/* ── Category, Role & Permissions ───────────────────────
              Your own account, or an admin looking at anyone's. A non-admin
              viewing SOMEONE ELSE (Staff list row → /account/:id) has no
              business seeing that person's role, category or admin status,
              and the change-request form below was actively wrong there:
              submitChangeRequest files against the signed-in user's own id
              (profile_id: user.id), so submitting it from another person's
              page raised a request on your own account carrying THEIR
              current role/category as its "from" value. */}
          {(isOwnAccount || isAdmin) && (
          <RoleAccessSection
            isAdmin={isAdmin} adminIsActive={adminIsActive} isOnLeave={isOnLeave} setStatusConfirmNextActive={setStatusConfirmNextActive}
            statusMsg={statusMsg} adminRole={adminRole} handleAdminRoleChange={handleAdminRoleChange} adminCategory={adminCategory}
            handleAdminCategoryChange={handleAdminCategoryChange} adminContractType={adminContractType}
            setAdminContractType={setAdminContractType} setAdminSubtype={setAdminSubtype} adminSubtype={adminSubtype}
            profile={profile} adminIsAdmin={adminIsAdmin} setAdminIsAdmin={setAdminIsAdmin} adminEcStart={adminEcStart}
            setAdminEcStart={setAdminEcStart} saveAdminAccountFields={saveAdminAccountFields} adminSaving={adminSaving}
            adminFieldsDirty={adminFieldsDirty} adminJustSaved={adminJustSaved} adminMsg={adminMsg} currentYear={currentYear}
            annualLeaveDays={annualLeaveDays} setAnnualLeaveDays={setAnnualLeaveDays} saveAnnualLeaveDays={saveAnnualLeaveDays}
            annualLeaveDaysSaving={annualLeaveDaysSaving} annualLeaveDaysLoaded={annualLeaveDaysLoaded}
            annualLeaveDaysJustSaved={annualLeaveDaysJustSaved} annualLeaveDaysMsg={annualLeaveDaysMsg}
            isOwnAccount={isOwnAccount} isSuperAdmin={isSuperAdmin} otherAdmins={otherAdmins}
            transferConfirming={transferConfirming} transferSuperAdmin={transferSuperAdmin} transferSaving={transferSaving}
            setTransferConfirming={setTransferConfirming} transferTargetId={transferTargetId}
            setTransferTargetId={setTransferTargetId} transferMsg={transferMsg} pendingRoleOrCategory={pendingRoleOrCategory}
            submitChangeRequest={submitChangeRequest} requestForm={requestForm} setRequestForm={setRequestForm}
            requestSaving={requestSaving} requestMsg={requestMsg}
          />
          )}

          {/* ── Regenerate password (admin, someone else's account) ──
              A SectionRow like every other section on this page: it opens
              underneath its own header rather than throwing a modal over
              the page, so a reader never loses their place on the account
              they are looking at. The Staff list's row menu still opens the
              same flow as a modal (RegeneratePasswordModal), because a list
              row has nothing to open into. Never on the admin's own
              account: they have Change password above. */}
          {isAdmin && !isOwnAccount && (
            <RegeneratePasswordSection profile={profile} targetEmail={targetEmail} reloadTarget={reloadTarget} />
          )}

          {/* ── See Rotations (admin only, Intern/Registrar/COSMO only) ──
              Not a SectionRow (nothing expands inline) — a plain
              navigational row to the Rotations planner, landing straight on
              this doctor's card there. Same category set the Rotations page
              itself manages (InternRotationsPlanner/InternRotationsMatrix's
              CATEGORY_GROUP_ORDER) — showing it for e.g. an MO or
              Consultant would link to a page that can never show them.
              Trailing icon uses the exact same wrapper (flex-shrink-0
              rounded p-1) as SectionRow's own chevron above, so it lines up
              in the same right-hand column despite not being one. */}
          {isAdmin && ['Intern', 'Registrar', 'COSMO'].includes(profile.category) && (
            <button
              type="button"
              onClick={() => navigate(`/leave?tab=planners&sub=interns&doctor=${profile.id}`)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
            >
              <span className="flex-shrink-0 text-ink-light"><CalendarClock className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">See Rotations</span>
              <span className="flex-shrink-0 rounded p-1 text-ink-muted"><ExternalLink className="h-4 w-4" /></span>
            </button>
          )}

          {/* ── Request history (own account only) ───────────────── */}
          {isOwnAccount && myRequests.length > 0 && (
            <RequestHistorySection myRequests={myRequests} />
          )}
        </div>
        </div>

        {/* ── Preferences (own account only — nothing here for an admin viewing someone else) ── */}
        {isOwnAccount && (
        <div>
        <SectionLabel>Preferences</SectionLabel>
        <div className="card overflow-hidden divide-y divide-slate-line">
            <AppearanceSection
              profile={profile} appearancePreviewColor={appearancePreviewColor} pickColorSwatch={pickColorSwatch}
              colorForm={colorForm} saveAppearance={saveAppearance} colorSaving={colorSaving} isColorDirty={isColorDirty}
              colorJustSaved={colorJustSaved} cancelAppearance={cancelAppearance} surpriseMe={surpriseMe}
              surprising={surprising} colorMsg={colorMsg}
            />

            {/* Colour theme. Only ever shown on your own account: the
                preference is stored per device for whoever is looking, so
                offering it on /account/:id would let an admin "change" a
                colleague's theme and silently restyle their own app instead. */}
            {isOwnAccount && (
            <ColourThemeSection />
            )}

            <NotificationsSection
              allNotificationsOn={allNotificationsOn} togglePrefs={togglePrefs} visibleNotificationKeys={visibleNotificationKeys}
              prefs={prefs} showAdvancedNotifications={showAdvancedNotifications}
              setShowAdvancedNotifications={setShowAdvancedNotifications}
            />
        </div>
        </div>
        )}

        {/* ── Sign out — mobile only: the desktop sidebar keeps its own
             always-visible sign-out, this is only here to replace the one
             that used to live in the mobile top bar (now Dashboard-only,
             see AppLayout.jsx). ── */}
        {isOwnAccount && (
          <div className="md:hidden">
            <div className="card overflow-hidden">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
              >
                <LogoutIcon className="h-5 w-5 text-ink-light" />
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* ── Danger zone (admin, someone else's account) ────────── */}
        {!isOwnAccount && isAdmin && (
          <AdminDeleteAccountSection
            profile={profile} adminDeleteConfirming={adminDeleteConfirming} adminDeleteCountdown={adminDeleteCountdown}
            adminDeleting={adminDeleting} undoAdminDelete={undoAdminDelete} adminDeleteTyped={adminDeleteTyped}
            setAdminDeleteTyped={setAdminDeleteTyped} startAdminDeleteCountdown={startAdminDeleteCountdown}
            adminDeleteError={adminDeleteError} adminDeleteSurnameMatches={adminDeleteSurnameMatches}
            resetAdminDelete={resetAdminDelete} setAdminDeleteConfirming={setAdminDeleteConfirming}
          />
        )}

        {/* ── Danger zone ───────────────────────────────────────── */}
        {isOwnAccount && (
          <OwnDeleteAccountSection
            pendingDeletion={pendingDeletion} deleteConfirming={deleteConfirming} requestDeletion={requestDeletion}
            deleteSaving={deleteSaving} setDeleteConfirming={setDeleteConfirming}
          />
        )}
      </div>

      {statusConfirmNextActive !== null && (
        <StatusChangeConfirmModal
          firstName={profile?.name}
          nextActive={statusConfirmNextActive}
          saving={statusConfirmSaving}
          onConfirm={confirmStatusChange}
          onClose={() => !statusConfirmSaving && setStatusConfirmNextActive(null)}
        />
      )}

      <AdminEmailDialogs
        adminEmailDialog={adminEmailDialog} setAdminEmailDialog={setAdminEmailDialog} adminEmailSaving={adminEmailSaving}
        confirmAdminEmailChange={confirmAdminEmailChange} targetFullName={targetFullName} targetEmail={targetEmail}
      />
    </div>
  )
}
