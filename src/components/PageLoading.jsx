// What shows while a page's code is still downloading (pages are loaded on
// first visit — see App.jsx). The same quiet "Loading…" the app uses
// everywhere else: full screen for a page outside the app shell (sign-up,
// password pages; same as ProtectedRoute's), and in the content area inside
// it, so the nav stays put.
export default function PageLoading({ fullScreen = false }) {
  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    )
  }
  return <p className="text-sm text-ink-muted">Loading…</p>
}
