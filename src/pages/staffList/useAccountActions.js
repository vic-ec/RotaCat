import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { defaultHoursForCategory, defaultSwapGroupForCategory, annualLeaveDaysForCategory } from '../../lib/staffDefaults'
import { setDoctorActiveStatus } from '../../lib/staffStatus'
import { notifyBadgesChanged } from '../../lib/navBadges'

// Admin actions on an account: the Active switch (asked first), the admin
// switch, and approving or rejecting a sign-up. Moved out of StaffListPage as it was.
export function useAccountActions({ loadAll }) {
  const [togglingId, setTogglingId] = useState(null)
  const [togglingAdminId, setTogglingAdminId] = useState(null)
  // Pending confirmation for the Status toggle — { profileId, currentlyActive, firstName } | null
  const [statusConfirm, setStatusConfirm] = useState(null)
  const [statusConfirmSaving, setStatusConfirmSaving] = useState(false)

  async function toggleActive(profileId, currentlyActive) {
    setTogglingId(profileId)
    await setDoctorActiveStatus(profileId, !currentlyActive)
    await loadAll()
    setTogglingId(null)
  }

  // Status toggle is consequential (excludes/re-includes someone from all
  // future scheduling) — gate the click behind StatusChangeConfirmModal
  // rather than firing toggleActive directly. Confirm runs the exact same
  // update as before; this only adds the extra step in front of it.
  function requestToggleActive(person) {
    setStatusConfirm({
      profileId: person.id,
      currentlyActive: person.is_active,
      firstName: person.name || person.surname || null,
    })
  }

  async function confirmStatusChange() {
    if (!statusConfirm) return
    setStatusConfirmSaving(true)
    await toggleActive(statusConfirm.profileId, statusConfirm.currentlyActive)
    setStatusConfirmSaving(false)
    setStatusConfirm(null)
  }

  async function toggleAdmin(person) {
    setTogglingAdminId(person.id)
    const { error } = await supabase.from('profiles')
      .update({ is_admin: !person.is_admin })
      .eq('id', person.id)
    if (error) alert(error.message.replace(/^.*?: /, ''))
    await loadAll()
    setTogglingAdminId(null)
  }

  // Role/category/admin-flag edits now happen on the dedicated pending-review
  // page (Kebab → Edit) and persist straight to the profiles row, so approval
  // itself just finalizes whatever is already saved there — no local
  // editData override to reconcile here anymore.
  async function approveOne(profile) {
    const role = profile.role || 'doctor'
    const rawCategory = profile.category || null
    const category =
      role === 'doctor' ? rawCategory :
      role === 'locum'  ? (['MO', 'Registrar'].includes(rawCategory) ? rawCategory : null) :
      null
    const isAdminFlag = role === 'doctor' ? (profile.is_admin ?? false) : false

    const finalContractType = profile.contract_type || 'full'
    const hours = defaultHoursForCategory(category, finalContractType)
    const swapGroup = defaultSwapGroupForCategory(category)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('profiles').update({
      is_approved:  true,
      is_active:    true,
      role,
      category:     category || null,
      contract_type: finalContractType,
      is_admin:     isAdminFlag,
      min_hours:    hours.min,
      max_hours:    hours.max,
      swap_group:   swapGroup,
      approved_by:  user.id,
      approved_at:  new Date().toISOString(),
    }).eq('id', profile.id)

    if (error) {
      console.error('Approval failed:', error.message)
      alert('Could not approve account: ' + error.message)
      return false
    }
    notifyBadgesChanged()

    const leaveDays = annualLeaveDaysForCategory(category)
    if (leaveDays !== null) {
      await supabase.from('annual_leave_balances').upsert(
        { profile_id: profile.id, year: new Date().getFullYear(), days_allotted: leaveDays },
        { onConflict: 'profile_id,year' }
      )
    }
    return true
  }

  async function approveAccount(profile) {
    if (await approveOne(profile)) loadAll()
  }

  async function rejectOne(profileId) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({
      is_approved: false,
      is_active: false,
      is_rejected: true,
      rejected_by: user?.id ?? null,
      rejected_at: new Date().toISOString(),
    }).eq('id', profileId)

    if (error) {
      console.error('Reject failed:', error.message)
      alert('Could not reject account: ' + error.message)
      return false
    }
    notifyBadgesChanged()
    return true
  }

  async function rejectAccount(profileId) {
    if (await rejectOne(profileId)) loadAll()
  }

  return {
    togglingId, togglingAdminId, statusConfirm, setStatusConfirm, statusConfirmSaving, requestToggleActive,
    confirmStatusChange, toggleAdmin, approveAccount, rejectAccount,
  }
}
