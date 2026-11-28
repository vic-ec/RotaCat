import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import StatusChangeConfirmModal from '../components/StatusChangeConfirmModal'
import AddStaffModal from '../components/AddStaffModal'
import ExpandAllButton from '../components/ExpandAllButton'
import RegeneratePasswordModal from '../components/RegeneratePasswordModal'
import { ContactFlyout } from '../components/ContactQuickMenu'
import { useStickyHeaderHeight } from './staffList/useStickyHeaderHeight'
import { useStaffData } from './staffList/useStaffData'
import { useRequestHistory } from './staffList/useRequestHistory'
import { useAccountActions } from './staffList/useAccountActions'
import { useRequestActions } from './staffList/useRequestActions'
import { useRequestQueues } from './staffList/useRequestQueues'
import { useAccountListFilters } from './staffList/useAccountListFilters'
import { useQuickActions } from './staffList/useQuickActions'
import StaffListHeader from './staffList/StaffListHeader'
import MobileStaffList from './staffList/MobileStaffList'
import DesktopStaffTable from './staffList/DesktopStaffTable'
import DeletionLog from './staffList/DeletionLog'
import NewUsersTab from './staffList/NewUsersTab'
import UserRequestsTab from './staffList/UserRequestsTab'
import AllRequestsTab from './staffList/AllRequestsTab'
import QuickActionMenu from './staffList/QuickActionMenu'
import StaffDetailSheet from './staffList/StaffDetailSheet'
import RequestReviewDrawer from './staffList/RequestReviewDrawer'

// The Staff list. Its pieces live in ./staffList/: the data and actions in
// hooks (useXxx), each tab, list, menu, sheet and drawer in a component.
export default function StaffListPage() {
  const { isAdmin, canViewStaffList } = useAuth()
  // Clerks, Locums, and MO/Registrar doctors are all read-only for account
  // management, but the mobile Quick Actions menu (Message/Call/Mail) is
  // pure contact info -- they all need that same access (see AuthContext's
  // canViewStaffList for the shared role/category rule this mirrors).
  // Account-settings navigation and admin-granting stay isAdmin-only,
  // unaffected by this.
  const canContact = canViewStaffList
  const navigate = useNavigate()
  const location = useLocation()
  const {
    stickyHeaderRef, stickyHeaderHeight,
  } = useStickyHeaderHeight()
  // 'active' is the landing tab: the people who matter day to day — on
  // the roster now, on leave, or newly created/approved and not yet signed
  // in or still on a temporary password. 'accounts' is the whole book,
  // inactive and finished accounts included. The two share the toolbar
  // and list below; only the predicate differs (see isListTab/tabAccounts).
  // A link can open a specific tab (?tab=pending) — the admin dashboard's
  // Needs attention rows land on the queue they are about.
  // Requests is one tab with three sub-pages (?tab=requests&sub=…), the
  // Planners shape: New Users (sign-ups awaiting approval, rostered locums
  // without an account), User Requests (account change requests) and All
  // Requests (everything decided). Older links (?tab=pending, ?tab=requests
  // on its own) still land on the right sub-page.
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(location.search).get('tab')
    if (!isAdmin) return ['active', 'accounts'].includes(requested) ? requested : 'active'
    if (requested === 'pending' || requested === 'requests') return 'requests'
    return ['active', 'accounts'].includes(requested) ? requested : 'active'
  }) // 'active' | 'accounts' | 'requests'
  const [sub, setSub] = useState(() => {
    const params = new URLSearchParams(location.search)
    const requestedSub = params.get('sub')
    if (['new-users', 'user-requests', 'all-requests'].includes(requestedSub)) return requestedSub
    return params.get('tab') === 'requests' ? 'user-requests' : 'new-users'
  }) // 'new-users' | 'user-requests' | 'all-requests'
  const openRequests = nextSub => { setTab('requests'); setSub(nextSub) }
  const isListTab = tab === 'active' || tab === 'accounts'
  const [requestSectionsCollapsed, setRequestSectionsCollapsed] = useState({})
  // Admin-initiated account creation, and reissuing a password for
  // someone who never received (or lost) the one their account was
  // created with — both run through the admin-staff-credentials Edge
  // Function, since only the service role key can mint credentials.
  const [addStaffOpen, setAddStaffOpen] = useState(false)
  const [regeneratePasswordFor, setRegeneratePasswordFor] = useState(null)
  const [deletionLogOpen, setDeletionLogOpen] = useState(false)
  // The account_change_requests row currently open in AccountRequestReviewDrawer, or null.
  const [expandedRequestId, setExpandedRequestId] = useState(null)

  const {
    activeAccounts, pending, locumContactCount, setLocumContactCount, loading, error, emailById,
    leaveProfileIds, leaveDatesById, deletionLog, neverSignedInIds, accountRequests, loadAll, activeUntilFor,
  } = useStaffData({ isAdmin, location })
  const {
    history, historyLoading, historyNames, historyFilters, setHistoryFilters, historySearch, setHistorySearch,
    historySort, setHistorySort,
  } = useRequestHistory({ isAdmin, tab, sub })
  const {
    togglingId, togglingAdminId, statusConfirm, setStatusConfirm, statusConfirmSaving, requestToggleActive,
    confirmStatusChange, toggleAdmin, approveAccount, rejectAccount,
  } = useAccountActions({ loadAll })
  const {
    requestActioningId, approveRequest, rejectRequest,
  } = useRequestActions({ loadAll })
  const {
    pendingSortDirection, setPendingSortDirection, requestsSortDirection, setRequestsSortDirection,
    pendingSearchQuery, setPendingSearchQuery, pendingRoleFilter, setPendingRoleFilter, requestsSearchQuery,
    setRequestsSearchQuery, requestsRoleFilter, setRequestsRoleFilter, pendingRoleOptions, filteredPending,
    orderedPending, requestsRoleOptions, filteredRequests, displayedRequests,
  } = useRequestQueues({ pending, accountRequests })
  const {
    accountFilters, setAccountFilters, sortMode, sortFacetValue, sortFacetOptions, handleSortFacetChange,
    collapsedGroups, setCollapsedGroups, toggleGroupCollapsed, filterGroups, filteredAccounts,
    accountFiltersActive, groups, allGroupsCollapsed, clearAllFilters,
  } = useAccountListFilters({ isAdmin, location, tab, activeAccounts, leaveProfileIds, neverSignedInIds })
  const {
    quickActionPerson, quickActionAnchor, secondaryFor, secondaryAnchor, quickActionMenuRef, secondaryMenuRef,
    toast, detailSheetPerson, sheetFlyout, setSheetFlyout, detailSheetRef, closeDetailSheet, toggleSheetFlyout,
    detailSheetSwipe, handleRowPointerDown, handleRowTouchEnd, cancelLongPress, handleRowClick,
    closeQuickActions, toggleQuickActions, toggleSecondary, openContactFlyout, contactMissing,
  } = useQuickActions({ canContact })

  return (
    <div className="mx-auto max-w-7xl">
      {/* An admin's tab row already names where they are (All Staff /
          Pending Approvals / User Requests), so it leads the page on its
          own — a "Staff" title above it only pushed the tabs and the list
          further down a phone screen. A non-admin has no tab row, so this
          title stands in for it: deliberately margin-free, sitting where
          the tabs would be, so the toolbar and list follow immediately
          rather than leaving a void where the admin tabs live. Outside the
          sticky container on purpose — inside it, the title would both
          stay pinned while scrolling and change that container's height,
          which the mobile group-label offsets below are measured against. */}
      {/* Sticky header — tab row (admin-only: All Staff / Pending Approvals /
          User Requests, via the shared PageTabs template) plus the Search/
          Sort/Filter toolbar (every viewer, only while on the accounts tab).
          top-0 on both breakpoints: AppLayout's mobile <header> is
          Dashboard-only now (never present on this page), so there's no
          app-bar height to offset below any more — this used to add its
          ~49px, which briefly went stale and hid this whole bar behind a
          gap once that header stopped rendering here.
          No border of its own — PageTabs already supplies the shared
          border-slate-line baseline with a border-accent underline on the
          active tab, so an outer border here would just double up on it.
          The gap below this bar is bottom PADDING, not margin — a sticky
          element only paints its own padding box; a margin here would leave
          an unpainted band beneath the stuck header that the list scrolls
          straight through, visible as a gap the scrolled-past rows show
          through.
          stickyHeaderRef feeds stickyHeaderHeight (see above), which the
          mobile card list's own sticky group labels use as their `top` —
          measured, not hand-picked, so it can never drift out of sync with
          this bar's actual rendered height again (see that ref's own
          comment for the history of it doing exactly that). */}
      {/* Rostered locums needing accounts live under Account Requests; the
          other tabs carry one line pointing there. */}
      {isAdmin && locumContactCount > 0 && tab !== 'requests' && (
        <button
          type="button"
          onClick={() => openRequests('new-users')}
          data-testid="locum-contacts-notice"
          className="card mb-3 flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 border-l-[3px] border-l-flagAmber px-3 py-2 text-left text-sm text-ink hover:bg-canvas-sunken"
        >
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-flagAmber-bg px-1.5 text-[11px] font-bold text-flagAmber">{locumContactCount}</span>
          <span className="min-w-0 flex-1">{locumContactCount === 1 ? 'Rostered locum needing an account' : 'Rostered locums needing accounts'}</span>
          {/* On its own line on a phone, where it does not fit beside the text. */}
          <span className="basis-full pl-[30px] text-xs font-semibold text-accent sm:basis-auto sm:pl-0">Go to New Users ›</span>
        </button>
      )}
      {/* -mt-2 cancels the pt-2 at rest, so the tabs start at the same
          height as every other page's (Rosters, Team Leave) — the padding
          used to push this page's row 8px lower than theirs. It stays as
          padding rather than going altogether because the bar is sticky:
          once stuck to the top of the screen, those 8px are what keep the
          tab labels off the very edge. */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-20 -mt-2 bg-canvas pb-3 pt-2 md:mt-0 md:pb-4 md:pt-0">
        <StaffListHeader
          isAdmin={isAdmin} tab={tab} setTab={setTab} sub={sub} setSub={setSub} isListTab={isListTab}
          pending={pending} locumContactCount={locumContactCount} history={history} historyNames={historyNames}
          historyFilters={historyFilters} setHistoryFilters={setHistoryFilters} historySearch={historySearch}
          setHistorySearch={setHistorySearch} historySort={historySort} setHistorySort={setHistorySort}
          pendingSortDirection={pendingSortDirection} setPendingSortDirection={setPendingSortDirection}
          setAddStaffOpen={setAddStaffOpen} accountFilters={accountFilters}
          setAccountFilters={setAccountFilters} accountRequests={accountRequests}
          requestsSortDirection={requestsSortDirection} setRequestsSortDirection={setRequestsSortDirection}
          pendingSearchQuery={pendingSearchQuery} setPendingSearchQuery={setPendingSearchQuery}
          pendingRoleFilter={pendingRoleFilter} setPendingRoleFilter={setPendingRoleFilter}
          requestsSearchQuery={requestsSearchQuery} setRequestsSearchQuery={setRequestsSearchQuery}
          requestsRoleFilter={requestsRoleFilter} setRequestsRoleFilter={setRequestsRoleFilter}
          sortMode={sortMode} sortFacetValue={sortFacetValue} sortFacetOptions={sortFacetOptions}
          handleSortFacetChange={handleSortFacetChange} filterGroups={filterGroups}
          accountFiltersActive={accountFiltersActive} pendingRoleOptions={pendingRoleOptions}
          requestsRoleOptions={requestsRoleOptions} clearAllFilters={clearAllFilters}
        />
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {error && (
        <div className="card mb-4 border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">Couldn&apos;t load staff: {error}</p>
        </div>
      )}

      {/* ── Tab: approved accounts with active/inactive toggle ── */}
      {!loading && isListTab && (
        <div>
          {activeAccounts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-muted">No approved accounts yet.</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="mb-3 text-sm text-ink-muted">No accounts match these filters.</p>
              {accountFiltersActive && (
                <button onClick={clearAllFilters} className="btn-secondary">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
            {/* Mobile: stacked rows, grouped by sortMode. Desktop/tablet: full table (below). */}
            <MobileStaffList
              isAdmin={isAdmin} canContact={canContact} stickyHeaderHeight={stickyHeaderHeight}
              leaveProfileIds={leaveProfileIds} neverSignedInIds={neverSignedInIds}
              collapsedGroups={collapsedGroups} toggleGroupCollapsed={toggleGroupCollapsed}
              handleRowPointerDown={handleRowPointerDown} handleRowTouchEnd={handleRowTouchEnd}
              cancelLongPress={cancelLongPress} handleRowClick={handleRowClick}
              toggleQuickActions={toggleQuickActions} groups={groups}
            />

            {/* Desktop/tablet: the Requests layout — each section's bar above
                its own panel, the column names inside the panel. Fixed column
                widths so the panels' columns line up down the page. */}
            <DesktopStaffTable
              isAdmin={isAdmin} canContact={canContact} navigate={navigate} location={location}
              togglingId={togglingId} togglingAdminId={togglingAdminId} emailById={emailById}
              leaveProfileIds={leaveProfileIds} neverSignedInIds={neverSignedInIds}
              collapsedGroups={collapsedGroups} toggleGroupCollapsed={toggleGroupCollapsed}
              activeUntilFor={activeUntilFor} requestToggleActive={requestToggleActive}
              toggleAdmin={toggleAdmin} openContactFlyout={openContactFlyout} contactMissing={contactMissing}
              groups={groups}
            />
            {/* One button for both lists: with every category shut, the
                page is nothing but headers on either viewport. */}
            {allGroupsCollapsed && <ExpandAllButton onExpandAll={() => setCollapsedGroups({})} />}
            </>
          )}

          {/* ── Recently deleted accounts (admin, All Staff only) ── */}
          {isAdmin && tab === 'accounts' && deletionLog.length > 0 && (
            <DeletionLog
              deletionLog={deletionLog} deletionLogOpen={deletionLogOpen}
              setDeletionLogOpen={setDeletionLogOpen}
            />
          )}
        </div>
      )}

      {/* ── Tab: pending account approvals (admin only) ── */}
      {/* No breadcrumb here — "← All staff" duplicated the already-active
          "Pending Approvals" tab above it (docs/design/layout-spec.md §4). */}
      {!loading && isAdmin && tab === 'requests' && sub === 'new-users' && (
        <NewUsersTab
          navigate={navigate} location={location} pending={pending} locumContactCount={locumContactCount}
          setLocumContactCount={setLocumContactCount} requestSectionsCollapsed={requestSectionsCollapsed}
          setRequestSectionsCollapsed={setRequestSectionsCollapsed} loadAll={loadAll}
          approveAccount={approveAccount} rejectAccount={rejectAccount} filteredPending={filteredPending}
          orderedPending={orderedPending}
        />
      )}

      {/* ── Tab: pending account change requests (admin only) ── */}
      {!loading && isAdmin && tab === 'requests' && sub === 'user-requests' && (
        <UserRequestsTab
          navigate={navigate} location={location} accountRequests={accountRequests}
          requestActioningId={requestActioningId} setExpandedRequestId={setExpandedRequestId}
          approveRequest={approveRequest} rejectRequest={rejectRequest} filteredRequests={filteredRequests}
          displayedRequests={displayedRequests}
        />
      )}

      {/* ── Tab: All Requests — everything decided, either way ── */}
      {!loading && isAdmin && tab === 'requests' && sub === 'all-requests' && (
        <AllRequestsTab
          navigate={navigate} location={location} history={history} historyLoading={historyLoading}
          historyNames={historyNames} historyFilters={historyFilters} historySearch={historySearch}
          historySort={historySort}
        />
      )}

      {/* ── Per-row quick-action popover — shared by both the mobile and
           desktop kebab triggers, visible to any canContact viewer (admin,
           clerk, locum, or MO/Registrar doctor). iOS Contacts-style:
           anchored to wherever the kebab was pressed (rolling down from a
           row in the top/middle of the screen, up from one near the
           bottom). Message/Call open a second, separate flyout popover
           cascading below that row (see below) rather than expanding in
           place. Mail goes straight to the mail client. Update status
           reuses the same requestToggleActive/StatusChangeConfirmModal
           flow as the desktop table's own status toggle — this is the
           only quick way to flip a doctor's active status from the
           mobile card list, since its StatusPicker badge renders
           read-only there. ── */}
      {quickActionPerson && quickActionAnchor && (
        <QuickActionMenu
          isAdmin={isAdmin} navigate={navigate} setRegeneratePasswordFor={setRegeneratePasswordFor}
          emailById={emailById} quickActionPerson={quickActionPerson} quickActionAnchor={quickActionAnchor}
          secondaryFor={secondaryFor} quickActionMenuRef={quickActionMenuRef}
          requestToggleActive={requestToggleActive} closeQuickActions={closeQuickActions}
          toggleSecondary={toggleSecondary} contactMissing={contactMissing}
        />
      )}

      {/* ── Message/Call flyout — a separate popover cascading below
           whichever row (or desktop row icon) was tapped, always rolling
           down: Mobile and WhatsApp. ── */}
      {quickActionPerson && secondaryFor && secondaryAnchor && (
        <ContactFlyout
          section={secondaryFor}
          anchor={secondaryAnchor}
          phone={quickActionPerson.phone}
          menuRef={secondaryMenuRef}
          onPicked={closeQuickActions}
          onMissing={() => { contactMissing(quickActionPerson.name || quickActionPerson.surname || 'this person'); closeQuickActions() }}
        />
      )}

      {/* ── Mobile row-tap detail sheet — profile summary, contact fields,
           and one-tap Message/Call/Email/View Account actions. Closes on
           the first outside tap (muting whatever's under it) or picking an
           action.

           It used to open with no backdrop, on the reasoning that no other
           popover in the app had one. That stopped being true — Modal,
           ActionSheet and SlideOverPanel all dim the page behind them — and
           it was the whole reason this sheet had nothing separating it from
           the staff list: both are `canvas-raised`, its border was the same
           `slate-line` as the cards behind it, and its shadow was a
           hardcoded light-theme black that a dark page swallows whole. The
           scrim does most of the work; `edge` and a themed shadow do the
           rest. ── */}
      {detailSheetPerson && (
        <StaffDetailSheet
          isAdmin={isAdmin} navigate={navigate} emailById={emailById} leaveProfileIds={leaveProfileIds}
          leaveDatesById={leaveDatesById} neverSignedInIds={neverSignedInIds}
          detailSheetPerson={detailSheetPerson} sheetFlyout={sheetFlyout} setSheetFlyout={setSheetFlyout}
          detailSheetRef={detailSheetRef} closeDetailSheet={closeDetailSheet}
          toggleSheetFlyout={toggleSheetFlyout} detailSheetSwipe={detailSheetSwipe}
          activeUntilFor={activeUntilFor} contactMissing={contactMissing}
        />
      )}

      {/* ── Missing-contact toast ────────────────────── */}
      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(70px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-4">
          <div className="rounded-lg bg-ink px-4 py-2.5 text-sm text-canvas shadow-raised">{toast}</div>
        </div>
      )}

      {expandedRequestId && (
        <RequestReviewDrawer
          accountRequests={accountRequests} requestActioningId={requestActioningId}
          expandedRequestId={expandedRequestId} setExpandedRequestId={setExpandedRequestId}
          approveRequest={approveRequest} rejectRequest={rejectRequest}
        />
      )}

      {addStaffOpen && (
        <AddStaffModal
          onClose={() => setAddStaffOpen(false)}
          onCreated={loadAll}
        />
      )}

      {regeneratePasswordFor && (
        <RegeneratePasswordModal
          person={regeneratePasswordFor}
          email={emailById[regeneratePasswordFor.id]}
          onClose={() => setRegeneratePasswordFor(null)}
        />
      )}

      {statusConfirm && (
        <StatusChangeConfirmModal
          firstName={statusConfirm.firstName}
          nextActive={!statusConfirm.currentlyActive}
          saving={statusConfirmSaving}
          onConfirm={confirmStatusChange}
          onClose={() => !statusConfirmSaving && setStatusConfirm(null)}
        />
      )}
    </div>
  )
}
