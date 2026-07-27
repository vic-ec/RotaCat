/**
 * RotaCat Scheduling Backend API
 * Centralises all calls to the Render FastAPI service so the backend URL
 * lives in one place (VITE_SCHEDULER_URL in .env.local / Vercel env vars).
 */

const BASE_URL = import.meta.env.VITE_SCHEDULER_URL

if (!BASE_URL) {
  console.warn(
    'VITE_SCHEDULER_URL is not set. Generation will not work until this ' +
    'environment variable is added to .env.local (locally) and to Vercel ' +
    'project settings (in production). Value should be your Render service ' +
    'URL, e.g. https://rotacatscheduler.onrender.com'
  )
}

/**
 * Generate a roster for a given month.
 * Calls POST /generate-roster on the Render backend.
 * Returns the full response JSON on success, throws on error.
 */
export async function generateRoster({ year, month, useCarryForward, adminProfileId }) {
  const url = `${BASE_URL}/generate-roster`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      year,
      month,
      use_carry_forward: useCarryForward,
      created_by: adminProfileId,
      time_limit_seconds: 180,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Backend error: ${res.status}`)
  }

  return res.json()
}

/**
 * Health check — confirms the backend is awake.
 * Useful to poll before triggering generation when Render free tier may be
 * sleeping (free instances sleep after inactivity and take ~30-60s to wake).
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(10000) })
    return res.ok
  } catch {
    return false
  }
}
