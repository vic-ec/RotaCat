import { supabase } from './supabase'

// Shared active/inactive write, previously copy-pasted inline in
// StaffListPage.jsx and AccountSettingsPage.jsx.
//
// Lives here rather than in staffDefaults.js on purpose: staffDefaults.js is
// pure, import-free category logic that weekendPlanner.js and leaveYearGrid.js
// both depend on, and giving it a supabase import would make those pure modules
// instantiate a network client just to read a category constant.
//
// Callers are responsible for confirming the change first — both call sites
// gate this behind StatusChangeConfirmModal, since deactivating someone
// excludes them from all future scheduling.
export async function setDoctorActiveStatus(profileId, nextActive) {
  return supabase.from('profiles').update({ is_active: nextActive }).eq('id', profileId)
}
