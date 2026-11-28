import { useEffect, useRef, useState } from 'react'
import { deleteStaffAccount } from '../../lib/staffCredentials'
import { DELETE_UNDO_SECONDS } from './accountSettingsHelpers'

// Admin: deleting someone else's account — type their surname, then a
// countdown with Undo, then the delete. Moved out of AccountSettingsPage as it was.
export function useAdminDeleteAccount({ profile, targetId, navigate }) {
  // Admin removing someone else's account outright (admin-staff-credentials
  // `delete`), as opposed to a doctor requesting their own removal above.
  const [adminDeleteConfirming, setAdminDeleteConfirming] = useState(false)
  const [adminDeleting, setAdminDeleting] = useState(false)
  const [adminDeleteError, setAdminDeleteError] = useState('')
  const [adminDeleteTyped, setAdminDeleteTyped] = useState('')
  // null = no countdown running; otherwise seconds left until the delete fires.
  const [adminDeleteCountdown, setAdminDeleteCountdown] = useState(null)
  const adminDeleteTimerRef = useRef(null)

  // The typed surname has to match before the countdown can even start.
  // Compared loosely (case, surrounding spaces, accents) — the point is
  // "are you looking at the right person", not a spelling test.
  const normalizeSurname = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const adminDeleteSurnameMatches =
    Boolean(profile?.surname) && normalizeSurname(adminDeleteTyped) === normalizeSurname(profile.surname)

  function clearAdminDeleteTimer() {
    if (adminDeleteTimerRef.current) clearInterval(adminDeleteTimerRef.current)
    adminDeleteTimerRef.current = null
  }

  function resetAdminDelete() {
    clearAdminDeleteTimer()
    setAdminDeleteCountdown(null)
    setAdminDeleteConfirming(false)
    setAdminDeleteTyped('')
    setAdminDeleteError('')
  }

  // Step 2 of 3: start the undo window. Nothing is sent to the server until
  // it runs out; Undo (or leaving this page) cancels it outright.
  function startAdminDeleteCountdown() {
    if (!adminDeleteSurnameMatches || adminDeleting) return
    setAdminDeleteError('')
    setAdminDeleteCountdown(DELETE_UNDO_SECONDS)
    clearAdminDeleteTimer()
    adminDeleteTimerRef.current = setInterval(() => {
      setAdminDeleteCountdown(prev => {
        if (prev === null) return null
        if (prev <= 1) {
          clearAdminDeleteTimer()
          adminDeleteAccount()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function undoAdminDelete() {
    clearAdminDeleteTimer()
    setAdminDeleteCountdown(null)
  }

  // A countdown must not outlive the page: closing the panel or navigating
  // away cancels a pending delete rather than firing it unseen.
  useEffect(() => clearAdminDeleteTimer, [])

  // Step 3 of 3: the actual delete, once the countdown has expired.
  async function adminDeleteAccount() {
    setAdminDeleting(true)
    setAdminDeleteError('')
    const result = await deleteStaffAccount(targetId)
    setAdminDeleting(false)
    setAdminDeleteCountdown(null)
    if (!result.ok) {
      setAdminDeleteError(result.error)
      return
    }
    navigate('/staff')
  }

  return {
    adminDeleteConfirming, setAdminDeleteConfirming, adminDeleting, adminDeleteError, adminDeleteTyped,
    setAdminDeleteTyped, adminDeleteCountdown, adminDeleteSurnameMatches, resetAdminDelete,
    startAdminDeleteCountdown, undoAdminDelete,
  }
}
