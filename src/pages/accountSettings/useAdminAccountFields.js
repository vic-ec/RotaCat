import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { categoryNeedsContractChoice } from '../../lib/staffDefaults'
import { applyHoursChange } from '../../lib/internRotations'
import { setDoctorActiveStatus } from '../../lib/staffStatus'
import { flashSaved } from './accountSettingsHelpers'

// Admin: role, category, hours, admin flag and In EC from for the account
// being viewed, and its Active/Inactive switch. Moved out of AccountSettingsPage as it was.
export function useAdminAccountFields({ profile, targetId, user, reloadTarget }) {
  // Admin: direct edit of role / category / admin flag for the account being viewed
  const [adminRole, setAdminRole] = useState('')
  const [adminCategory, setAdminCategory] = useState('')
  const [adminContractType, setAdminContractType] = useState('full')
  const [adminSubtype, setAdminSubtype] = useState(null)
  const [adminIsAdmin, setAdminIsAdmin] = useState(false)
  const [adminIsActive, setAdminIsActive] = useState(true)
  // First day in the EC (profiles.ec_start_date): days before it aren't
  // held against the contracted minimum (lib/contractMinimum.js).
  const [adminEcStart, setAdminEcStart] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)
  const [adminJustSaved, setAdminJustSaved] = useState(false)
  const [adminMsg, setAdminMsg] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  // Pending confirmation for the admin Active/Inactive toggle — the next
  // value to apply if confirmed, or null when no confirmation is pending.
  const [statusConfirmNextActive, setStatusConfirmNextActive] = useState(null)
  const [statusConfirmSaving, setStatusConfirmSaving] = useState(false)

  // ── Admin: direct role/category/admin-flag edit ─────────────
  function handleAdminRoleChange(value) {
    setAdminRole(value)
    setAdminCategory('') // clear — the valid category set differs per role
    setAdminContractType('full')
    setAdminSubtype(null)
  }

  function handleAdminCategoryChange(value) {
    setAdminCategory(value)
    if (!categoryNeedsContractChoice(value)) {
      setAdminContractType('full')
      setAdminSubtype(null)
    }
  }

  const adminFieldsDirty =
    adminRole !== (profile?.role || '') ||
    adminCategory !== (profile?.category || '') ||
    (categoryNeedsContractChoice(adminCategory) && adminContractType !== (profile?.contract_type || 'full')) ||
    (categoryNeedsContractChoice(adminCategory) && adminContractType === 'Junior_Doctor_Overtime' && adminSubtype !== (profile?.psych_subcategory || null)) ||
    adminIsAdmin !== (profile?.is_admin === true) ||
    (adminRole === 'doctor' && adminEcStart !== (profile?.ec_start_date || ''))

  async function saveAdminAccountFields() {
    setAdminSaving(true)
    setAdminMsg(null)

    if (adminRole === 'doctor' && !adminCategory) {
      setAdminSaving(false)
      setAdminMsg({ type: 'error', text: 'Select a category for a doctor account.' })
      return
    }
    if (adminRole === 'doctor' && categoryNeedsContractChoice(adminCategory) && !adminContractType) {
      setAdminSaving(false)
      setAdminMsg({ type: 'error', text: 'Select EC or OT hours for this category.' })
      return
    }

    const finalCategory = adminRole === 'clerk' ? null : (adminCategory || null)
    const needsHours = adminRole === 'doctor' && categoryNeedsContractChoice(finalCategory)

    const { error } = await supabase
      .from('profiles')
      .update({
        role: adminRole,
        category: finalCategory,
        is_admin: adminRole === 'clerk' ? false : adminIsAdmin,
        ...(adminRole === 'doctor' ? { ec_start_date: adminEcStart || null } : {}),
      })
      .eq('id', targetId)

    if (error) {
      setAdminSaving(false)
      setAdminMsg({ type: 'error', text: error.message })
      return
    }

    if (needsHours) {
      try {
        await applyHoursChange({
          profileId: targetId,
          category: finalCategory,
          contractType: adminContractType,
          subtype: adminContractType === 'Junior_Doctor_Overtime' ? adminSubtype : null,
          actorId: user.id,
        })
      } catch (err) {
        setAdminSaving(false)
        setAdminMsg({ type: 'error', text: err.message })
        return
      }
    }

    setAdminSaving(false)
    flashSaved(setAdminJustSaved)
    reloadTarget()
  }

  // ── Status: active/inactive (admin-editable, its own section) ──
  async function saveActiveStatus(nextActive) {
    const prevActive = adminIsActive
    setAdminIsActive(nextActive)
    setStatusMsg(null)

    const { error } = await setDoctorActiveStatus(targetId, nextActive)

    if (error) {
      setAdminIsActive(prevActive)
      setStatusMsg({ type: 'error', text: error.message })
    } else {
      reloadTarget()
    }
  }

  // The toggle is consequential (excludes/re-includes someone from all
  // future scheduling) — gate it behind StatusChangeConfirmModal rather
  // than calling saveActiveStatus directly from the switch. Confirm runs
  // the exact same update as before; this only adds the extra step.
  async function confirmStatusChange() {
    if (statusConfirmNextActive === null) return
    setStatusConfirmSaving(true)
    await saveActiveStatus(statusConfirmNextActive)
    setStatusConfirmSaving(false)
    setStatusConfirmNextActive(null)
  }

  return {
    adminRole, setAdminRole, adminCategory, setAdminCategory, adminContractType, setAdminContractType,
    adminSubtype, setAdminSubtype, adminIsAdmin, setAdminIsAdmin, adminIsActive, setAdminIsActive, adminEcStart,
    setAdminEcStart, adminSaving, adminJustSaved, adminMsg, statusMsg, statusConfirmNextActive,
    setStatusConfirmNextActive, statusConfirmSaving, handleAdminRoleChange, handleAdminCategoryChange,
    adminFieldsDirty, saveAdminAccountFields, confirmStatusChange,
  }
}
