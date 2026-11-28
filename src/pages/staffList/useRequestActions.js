import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { applyHoursChange } from '../../lib/internRotations'
import { notifyBadgesChanged } from '../../lib/navBadges'

// Approving or rejecting an account change request. Moved out of StaffListPage as it was.
export function useRequestActions({ loadAll }) {
  const [requestActioningId, setRequestActioningId] = useState(null)

  async function approveRequest(request) {
    setRequestActioningId(request.id)
    const { data: { user } } = await supabase.auth.getUser()

    // Apply the actual change first
    if (request.request_type === 'role') {
      const patch = { role: request.requested_value }
      if (request.requested_value === 'clerk') {
        patch.category = null
      } else if (request.requested_value === 'locum') {
        // Locums can only carry MO/Registrar (drives shift-claim eligibility) — clear otherwise
        const { data: current } = await supabase.from('profiles').select('category').eq('id', request.profile_id).single()
        patch.category = ['MO', 'Registrar'].includes(current?.category) ? current.category : null
      }
      await supabase.from('profiles').update(patch).eq('id', request.profile_id)
    } else if (request.request_type === 'category') {
      const patch = { category: request.requested_value }
      // A locum's category is normally just an MO/Registrar eligibility tag
      // (drives which advertised shifts they can claim) and doesn't by
      // itself mean they're becoming a full doctor — but approving one
      // often *does* mean exactly that (e.g. someone who's finished
      // locuming and joined the roster properly), so ask rather than
      // silently leaving them a Locum or silently promoting every locum
      // category tag to Doctor.
      const { data: current } = await supabase.from('profiles').select('role').eq('id', request.profile_id).single()
      if (current?.role === 'locum') {
        const name = `${request.requester?.name || ''} ${request.requester?.surname || ''}`.trim() || 'this account'
        const promote = window.confirm(
          `Also change ${name}'s role from Locum to Doctor?\n\nOK = promote to Doctor with category ${request.requested_value}.\nCancel = keep them a Locum, just tagged eligible for ${request.requested_value} shifts.`
        )
        if (promote) patch.role = 'doctor'
      }
      await supabase.from('profiles').update(patch).eq('id', request.profile_id)
    } else if (request.request_type === 'hours') {
      try {
        const { contract_type, subtype } = JSON.parse(request.requested_value)
        await applyHoursChange({
          profileId: request.profile_id,
          category: request.requester?.category,
          contractType: contract_type,
          subtype,
          actorId: user.id,
        })
      } catch (err) {
        alert('Could not apply hours change: ' + err.message)
        setRequestActioningId(null)
        return
      }
    } else if (request.request_type === 'deletion') {
      // Client-side keys can't delete an auth user directly (needs service role).
      // Deactivate the account now; remove the auth user manually in Supabase if required.
      await supabase.from('profiles').update({ is_active: false, is_approved: false }).eq('id', request.profile_id)
    }

    const { error } = await supabase.from('account_change_requests').update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', request.id)

    if (error) alert('Could not update request: ' + error.message)
    else notifyBadgesChanged()
    await loadAll()
    setRequestActioningId(null)
  }

  async function rejectRequest(request, notes) {
    setRequestActioningId(request.id)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('account_change_requests').update({
      status: 'rejected',
      admin_notes: notes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', request.id)

    if (error) alert('Could not update request: ' + error.message)
    else notifyBadgesChanged()
    await loadAll()
    setRequestActioningId(null)
  }

  return {
    requestActioningId, approveRequest, rejectRequest,
  }
}
