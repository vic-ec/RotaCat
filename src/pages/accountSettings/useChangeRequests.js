import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Your own requests to an admin: role / category / hours changes and
// account deletion, and their history. Moved out of AccountSettingsPage as it was.
export function useChangeRequests({ user, profile }) {
  // Non-admin: request role/category changes
  const [myRequests, setMyRequests] = useState([])
  const [requestForm, setRequestForm] = useState({ type: 'role', value: '', subtype: null, reason: '' })
  const [requestSaving, setRequestSaving] = useState(false)
  const [requestMsg, setRequestMsg] = useState(null)

  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    loadMyRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMyRequests is redefined every render; including it would refetch in a loop
  }, [user?.id])

  async function loadMyRequests() {
    const { data, error } = await supabase
      .from('account_change_requests')
      .select('*, reviewer:profiles!account_change_requests_reviewed_by_fkey(name, surname)')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
    if (!error) setMyRequests(data || [])
  }

  const pendingDeletion = myRequests.some(r => r.request_type === 'deletion' && r.status === 'pending')
  const pendingRoleOrCategory = myRequests.find(
    r => (r.request_type === 'role' || r.request_type === 'category' || r.request_type === 'hours') && r.status === 'pending'
  )

  // ── Non-admin: request role/category change ────────────────
  async function submitChangeRequest(e) {
    e.preventDefault()
    setRequestMsg(null)

    if (!requestForm.value) {
      setRequestMsg({ type: 'error', text: 'Choose the new value you’re requesting.' })
      return
    }

    if (requestForm.type === 'hours' && requestForm.value === 'Junior_Doctor_Overtime' && !requestForm.subtype) {
      setRequestMsg({ type: 'error', text: 'Choose an OT subtype.' })
      return
    }

    setRequestSaving(true)
    let currentValue, requestedValue
    if (requestForm.type === 'role') {
      currentValue = profile.role
      requestedValue = requestForm.value
    } else if (requestForm.type === 'category') {
      currentValue = profile.category
      requestedValue = requestForm.value
    } else {
      currentValue = JSON.stringify({ contract_type: profile.contract_type || 'full', subtype: profile.psych_subcategory || null })
      requestedValue = JSON.stringify({
        contract_type: requestForm.value,
        subtype: requestForm.value === 'Junior_Doctor_Overtime' ? requestForm.subtype : null,
      })
    }

    const { error } = await supabase.from('account_change_requests').insert({
      profile_id: user.id,
      request_type: requestForm.type,
      current_value: currentValue,
      requested_value: requestedValue,
      reason: requestForm.reason.trim() || null,
    })
    setRequestSaving(false)

    if (error) {
      setRequestMsg({ type: 'error', text: error.message })
    } else {
      setRequestMsg({ type: 'success', text: 'Request submitted — an admin will review it.' })
      setRequestForm({ type: 'role', value: '', subtype: null, reason: '' })
      loadMyRequests()
    }
  }

  // ── Account deletion request ────────────────────────────────
  async function requestDeletion() {
    setDeleteSaving(true)
    const { error } = await supabase.from('account_change_requests').insert({
      profile_id: user.id,
      request_type: 'deletion',
      current_value: null,
      requested_value: null,
      reason: null,
    })
    setDeleteSaving(false)
    setDeleteConfirming(false)
    if (error) {
      alert('Could not submit deletion request: ' + error.message)
    } else {
      loadMyRequests()
    }
  }

  return {
    myRequests, requestForm, setRequestForm, requestSaving, requestMsg, deleteConfirming, setDeleteConfirming,
    deleteSaving, pendingDeletion, pendingRoleOrCategory, submitChangeRequest, requestDeletion,
  }
}
