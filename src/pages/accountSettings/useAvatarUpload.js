import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getCroppedImageBlob } from '../../lib/cropImage'

// Your profile picture: choosing a file, cropping and uploading it, and
// deleting it. Moved out of AccountSettingsPage as it was.
export function useAvatarUpload({ user, refreshProfile }) {
  const [cropSrc, setCropSrc] = useState(null) // object URL while cropping
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  // ── Avatar (own account only) ────────────────────────────────
  function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError('Image must be under 8MB.')
      return
    }
    setCropSrc(URL.createObjectURL(file))
    e.target.value = '' // allow re-selecting the same file later
  }

  async function confirmCrop(croppedAreaPixels) {
    if (!croppedAreaPixels) return
    setUploadingAvatar(true)
    setAvatarError('')

    try {
      const blob = await getCroppedImageBlob(cropSrc, croppedAreaPixels)
      const path = `${user.id}/avatar.jpg`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, cacheControl: '3600', contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      refreshProfile()
      URL.revokeObjectURL(cropSrc)
      setCropSrc(null)
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function deleteAvatar() {
    setUploadingAvatar(true)
    setAvatarError('')
    await supabase.storage.from('avatars').remove([`${user.id}/avatar.jpg`])
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id)
    setUploadingAvatar(false)
    if (error) {
      setAvatarError(error.message)
      return
    }
    refreshProfile()
  }

  return { cropSrc, setCropSrc, uploadingAvatar, avatarError, handleAvatarSelect, confirmCrop, deleteAvatar }
}
