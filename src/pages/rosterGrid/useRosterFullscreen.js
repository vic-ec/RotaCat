import { useEffect, useState } from 'react'

// Moved out of RosterGridPage as it was.
export function useRosterFullscreen() {
  // Fullscreen: the app's bars and the roster's own toolbars hide so the
  // grid has the whole screen (landscape phones, screenshots). Where the
  // browser allows it (desktop, Android) the page goes truly fullscreen
  // too; an iPhone has no such API, so there it is just the bars.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    document.body.classList.toggle('roster-fullscreen', fullscreen)
    return () => document.body.classList.remove('roster-fullscreen')
  }, [fullscreen])
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  function enterFullscreen() {
    setFullscreen(true)
    try { document.documentElement.requestFullscreen?.().catch(() => {}) } catch { /* not supported */ }
  }
  function exitFullscreen() {
    setFullscreen(false)
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) } catch { /* not supported */ }
  }

  return { fullscreen, enterFullscreen, exitFullscreen }
}
