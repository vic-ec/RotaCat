import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Super-admin: handing the role to another admin. Moved out of AccountSettingsPage as it was.
export function useSuperAdminTransfer({ isSuperAdmin, user, isOwnAccount, refreshProfile }) {
  // Super-admin: transfer to another admin (own account only)
  const [otherAdmins, setOtherAdmins] = useState([])
  const [transferTargetId, setTransferTargetId] = useState('')
  const [transferConfirming, setTransferConfirming] = useState(false)
  const [transferSaving, setTransferSaving] = useState(false)
  const [transferMsg, setTransferMsg] = useState(null)

  useEffect(() => {
    if (!isSuperAdmin || !user || !isOwnAccount) return
    supabase
      .from('profiles')
      .select('id, name, surname')
      .eq('is_admin', true)
      .neq('id', user.id)
      .then(({ data }) => setOtherAdmins(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user.id is the only field read; the object itself changes identity on every auth event
  }, [isSuperAdmin, user?.id, isOwnAccount])

  // ── Super-admin: transfer to another admin ──────────────────
  async function transferSuperAdmin() {
    if (!transferTargetId) return
    setTransferSaving(true)
    setTransferMsg(null)

    const { error } = await supabase.rpc('transfer_super_admin', { new_super_admin_id: transferTargetId })

    setTransferSaving(false)
    setTransferConfirming(false)
    if (error) {
      setTransferMsg({ type: 'error', text: error.message })
    } else {
      setTransferMsg({ type: 'success', text: 'Super-admin transferred.' })
      refreshProfile()
    }
  }

  return {
    otherAdmins, transferTargetId, setTransferTargetId, transferConfirming, setTransferConfirming, transferSaving,
    transferMsg, transferSuperAdmin,
  }
}
