// Config for the Staff list's per-row quick-action menu (kebab button, admin
// viewers only). Three actions for two admins doesn't justify a database-backed
// customization UI — if this list needs to change, edit it here directly.
//
// `requiresSuperAdmin` keeps "Set admin" behind the same gate as the app's
// other super-admin-only affordances, since granting admin rights is more
// sensitive than toggling status or opening a profile.
export const STAFF_QUICK_ACTIONS = [
  { key: 'setStatus',   label: 'Set status',   requiresSuperAdmin: false },
  { key: 'setAdmin',    label: 'Set admin',     requiresSuperAdmin: true },
  { key: 'editProfile', label: 'Edit profile',  requiresSuperAdmin: false },
]
