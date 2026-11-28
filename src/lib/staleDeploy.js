// Keeps a browser that is still running the previous deploy from showing
// broken pieces of it. Each deploy renames the app's files (images, page
// code); the server answers a request for an old name with the app's
// start page, so an old copy kept by the offline cache asks for files
// that are no longer there — a blank login mascot, or a page that can't
// load. Two guards:
//
// - registerServiceWorker: when a new version takes over in the
//   background, reload once onto it (vite-plugin-pwa's autoUpdate does
//   this when registered from code rather than its injected script).
// - reloadOnMissingChunk: if a page's code fails to download (Vite's
//   `vite:preloadError`), reload once to pick up the current deploy.
//   Not twice in a row, so a real outage shows its error rather than
//   looping.
const RELOAD_KEY = 'rotacat:chunkReloadAt'
const RELOAD_GAP_MS = 10000

export function reloadOnMissingChunk(win = window) {
  win.addEventListener('vite:preloadError', event => {
    let last = 0
    try { last = Number(win.sessionStorage.getItem(RELOAD_KEY)) || 0 } catch { /* storage blocked */ }
    if (Date.now() - last < RELOAD_GAP_MS) return
    try { win.sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* storage blocked */ }
    event.preventDefault()
    win.location.reload()
  })
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({ immediate: true })
}
