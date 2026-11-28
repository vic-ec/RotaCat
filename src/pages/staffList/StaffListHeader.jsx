import { Plus } from 'lucide-react'
import PageTabs from '../../components/PageTabs'
import Toolbar from '../../components/Toolbar'
import FloatingActionMenu from '../../components/FloatingActionMenu'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import { historyFiltersActive, EMPTY_HISTORY_FILTERS, HISTORY_STATUS_OPTIONS, HISTORY_TYPE_OPTIONS } from '../../lib/requestHistory'
import { ListFilterIcon, ZapIcon } from './icons'

// Inside the sticky header: the tabs, the Requests sub-tabs, and each
// tab's search / sort / filter toolbar (and its phone menu). Moved out of StaffListPage as it was.
export default function StaffListHeader({
  isAdmin, tab, setTab, sub, setSub, isListTab, pending, locumContactCount, history, historyNames,
  historyFilters, setHistoryFilters, historySearch, setHistorySearch, historySort, setHistorySort,
  pendingSortDirection, setPendingSortDirection, setAddStaffOpen, accountFilters, setAccountFilters,
  accountRequests, requestsSortDirection, setRequestsSortDirection, pendingSearchQuery, setPendingSearchQuery,
  pendingRoleFilter, setPendingRoleFilter, requestsSearchQuery, setRequestsSearchQuery, requestsRoleFilter,
  setRequestsRoleFilter, sortMode, sortFacetValue, sortFacetOptions, handleSortFacetChange, filterGroups,
  accountFiltersActive, pendingRoleOptions, requestsRoleOptions, clearAllFilters,
}) {
  return (
    <>
    {/* Every viewer gets Active Staff / All Staff; the two admin queues
        follow for admins only. */}
    <PageTabs
      tabs={[
        { key: 'active', label: 'Active Staff' },
        { key: 'accounts', label: 'All Staff' },
        // Everything outstanding, in one count: red while a person is
        // waiting on an approval, the accent otherwise.
        ...(isAdmin ? [{
          key: 'requests', label: 'Requests',
          badge: pending.length + accountRequests.length + locumContactCount,
          badgeColor: pending.length > 0 ? 'red' : undefined,
        }] : []),
      ]}
      active={tab}
      onChange={setTab}
      ariaLabel="Staff"
    />
    {isAdmin && tab === 'requests' && (
      <div className="mt-2">
        <PageTabs
          size="sub"
          tabs={[
            pending.length > 0
              ? { key: 'new-users', label: 'New Users', badge: pending.length, badgeColor: 'red' }
              : { key: 'new-users', label: 'New Users', badge: locumContactCount },
            { key: 'user-requests', label: 'User Requests', badge: accountRequests.length },
            { key: 'all-requests', label: 'All Requests' },
          ]}
          active={sub}
          onChange={setSub}
          ariaLabel="Requests"
        />
      </div>
    )}

    {isListTab && (() => {
      const sortFacets = [{
        key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
        value: sortFacetValue, onChange: handleSortFacetChange,
        options: sortFacetOptions, isActive: sortMode !== 'category',
      }]
      const onSearchChange = q => setAccountFilters(f => ({ ...f, q }))
      return (
        <>
          {/* Below `md` this row is replaced by the Toolbar FAB (§15).
              The mobile card list's own sticky group labels are offset
              against this header's height, so they shrink by the row's
              38px (30px control + mt-2) below `md` too — see their
              `top-[…]` classes further down. */}
          {/* Add staff leads the row, beside the search, where the
              Roster page keeps its Create. */}
          <div className="mt-2 hidden items-start gap-2 md:flex">
            {isAdmin && (
              <button type="button" onClick={() => setAddStaffOpen(true)} className="btn-primary flex-shrink-0 whitespace-nowrap">
                <Plus className="h-4 w-4" /> Add staff
              </button>
            )}
            <div className="min-w-0 flex-1">
              <Toolbar
                className=""
                searchValue={accountFilters.q}
                onSearchChange={onSearchChange}
                searchPlaceholder="Surname or first name…"
                sortFacets={sortFacets}
                filterGroups={filterGroups}
                mobileMode="inline"
                active={accountFiltersActive}
                onClearAll={clearAllFilters}
              />
            </div>
          </div>
          <FloatingActionMenu
            search={{ value: accountFilters.q, onChange: onSearchChange, placeholder: 'Surname or first name…' }}
            sort={{ facets: sortFacets, active: sortMode !== 'category' }}
            filter={{
              groups: filterGroups,
              active: accountFiltersActive,
              onClearAll: clearAllFilters,
              sheetTitle: 'Filters',
            }}
            /* Same slot the Intern Rotations Matrix puts its own
               "+ Add doctor" in, rather than a second free-floating
               FAB competing with this one. */
            primaryAction={isAdmin ? { icon: Plus, label: 'Add staff', onClick: () => setAddStaffOpen(true) } : undefined}
          />
        </>
      )
    })()}

    {tab === 'requests' && sub === 'new-users' && (() => {
      const sortFacets = [{
        key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
        value: pendingSortDirection, onChange: setPendingSortDirection,
        options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }],
        isActive: pendingSortDirection !== 'asc',
      }]
      const filterFacets = [{
        key: 'filter', icon: <ListFilterIcon className="h-4 w-4" />, label: 'Filter',
        value: pendingRoleFilter, onChange: setPendingRoleFilter,
        options: [{ value: 'all', label: 'All roles' }, ...pendingRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))],
        isActive: pendingRoleFilter !== 'all',
      }]
      const clearActive = Boolean(pendingSearchQuery) || pendingRoleFilter !== 'all'
      const onClearAll = () => { setPendingSearchQuery(''); setPendingRoleFilter('all') }
      return (
        <>
          <div className="mx-auto hidden md:block md:max-w-2xl">
            <Toolbar
              className={isAdmin ? 'mt-2' : ''}
              searchValue={pendingSearchQuery}
              onSearchChange={setPendingSearchQuery}
              searchPlaceholder="Search by surname or first name…"
              sortFacets={sortFacets}
              filterFacets={filterFacets}
              mobileMode="inline"
              active={clearActive}
              onClearAll={onClearAll}
            />
          </div>
          {/* Bulk actions live in the list's own select-all header, not
              a bottom-fixed bar, so the FAB no longer has to hide while
              rows are checked. */}
          <FloatingActionMenu
            search={{ value: pendingSearchQuery, onChange: setPendingSearchQuery, placeholder: 'Search by surname or first name…' }}
            sort={{ facets: sortFacets, active: pendingSortDirection !== 'asc' }}
            filter={{
              facets: filterFacets,
              active: clearActive,
              onClearAll,
              sheetTitle: 'Filters',
            }}
          />
        </>
      )
    })()}

    {tab === 'requests' && sub === 'user-requests' && (() => {
      const sortFacets = [{
        key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
        value: requestsSortDirection, onChange: setRequestsSortDirection,
        options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }],
        isActive: requestsSortDirection !== 'asc',
      }]
      const filterFacets = [{
        key: 'filter', icon: <ListFilterIcon className="h-4 w-4" />, label: 'Filter',
        value: requestsRoleFilter, onChange: setRequestsRoleFilter,
        options: [{ value: 'all', label: 'All roles' }, ...requestsRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))],
        isActive: requestsRoleFilter !== 'all',
      }]
      const clearActive = Boolean(requestsSearchQuery) || requestsRoleFilter !== 'all'
      const onClearAll = () => { setRequestsSearchQuery(''); setRequestsRoleFilter('all') }
      return (
        <>
          <div className="mx-auto hidden md:block md:max-w-2xl">
            <Toolbar
              className={isAdmin ? 'mt-2' : ''}
              searchValue={requestsSearchQuery}
              onSearchChange={setRequestsSearchQuery}
              searchPlaceholder="Search by surname or first name…"
              sortFacets={sortFacets}
              filterFacets={filterFacets}
              mobileMode="inline"
              active={clearActive}
              onClearAll={onClearAll}
            />
          </div>
          <FloatingActionMenu
            search={{ value: requestsSearchQuery, onChange: setRequestsSearchQuery, placeholder: 'Search by surname or first name…' }}
            sort={{ facets: sortFacets, active: requestsSortDirection !== 'asc' }}
            filter={{
              facets: filterFacets,
              active: clearActive,
              onClearAll,
              sheetTitle: 'Filters',
            }}
          />
        </>
      )
    })()}
    {tab === 'requests' && sub === 'all-requests' && (() => {
      const setF = key => next => setHistoryFilters(f => ({ ...f, [key]: next }))
      const categoryOptions = [...new Set(history.map(i => i.category).filter(Boolean))].sort().map(c => ({ value: c, label: CATEGORY_LABELS[c] || c }))
      const roleOptions = [...new Set(history.map(i => i.role).filter(Boolean))].sort().map(r => ({ value: r, label: ROLE_LABELS[r] || r }))
      const reviewerOptions = [...historyNames.values()].map(p => ({ value: p.id, label: `${p.name} ${p.surname}` })).sort((a, b) => a.label.localeCompare(b.label))
      const filterGroups = [
        { key: 'status', label: 'Outcome', options: HISTORY_STATUS_OPTIONS, selected: historyFilters.statuses, onChange: setF('statuses') },
        { key: 'type', label: 'Request type', options: HISTORY_TYPE_OPTIONS, selected: historyFilters.types, onChange: setF('types') },
        { key: 'category', label: 'Category', options: categoryOptions, selected: historyFilters.categories, onChange: setF('categories') },
        { key: 'role', label: 'Role', options: roleOptions, selected: historyFilters.roles, onChange: setF('roles') },
        { key: 'reviewer', label: 'Reviewed by', options: reviewerOptions, selected: historyFilters.reviewers, onChange: setF('reviewers') },
      ]
      const sortFacets = [{
        key: 'sort', icon: <ZapIcon className="h-4 w-4" />, label: 'Sort',
        value: historySort, onChange: setHistorySort,
        options: [{ value: 'desc', label: 'Newest first' }, { value: 'asc', label: 'Oldest first' }],
        isActive: historySort !== 'desc',
      }]
      const clearActive = historyFiltersActive(historyFilters, historySearch)
      const onClearAll = () => { setHistoryFilters(EMPTY_HISTORY_FILTERS); setHistorySearch('') }
      return (
        <>
          <div className="mx-auto hidden md:block md:max-w-2xl">
            <Toolbar
              className="mt-2"
              searchValue={historySearch}
              onSearchChange={setHistorySearch}
              searchPlaceholder="Search by surname or first name…"
              sortFacets={sortFacets}
              filterGroups={filterGroups}
              mobileMode="inline"
              active={clearActive}
              onClearAll={onClearAll}
            />
          </div>
          <FloatingActionMenu
            search={{ value: historySearch, onChange: setHistorySearch, placeholder: 'Search by surname or first name…' }}
            sort={{ facets: sortFacets, active: historySort !== 'desc' }}
            filter={{ groups: filterGroups, active: clearActive, onClearAll, sheetTitle: 'Filters' }}
          />
        </>
      )
    })()}
    </>
  )
}
