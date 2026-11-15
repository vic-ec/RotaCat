// Starts a roster generation run on GitHub Actions.
//
// The scheduler no longer answers a browser request: it runs as a
// GitHub Actions workflow in the RotaCatScheduler repo (about five
// minutes on a 16 GB runner). This function is the bridge. It records the
// request as a row in roster_generation_jobs, tells GitHub to start the
// workflow with that row's id, and returns the job so the app can follow
// its status. The runner reads its options from the row and writes the
// outcome back to it.
//
//   POST { action: 'start', year, month, useCarryForward?, excludedProfileIds? }
//     → { ok: true, job, alreadyRunning }
//
// It holds the one credential the browser must never see: a GitHub token
// that can start workflows (GITHUB_DISPATCH_TOKEN). Every request is
// authenticated as a signed-in user (verify_jwt is on) AND checked against
// profiles.is_admin, the same gate as admin-staff-credentials.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// A healthy run finishes in about five minutes and the workflow itself is
// capped at 20. A job still 'queued' or 'running' after this long has lost
// its runner (cancelled run, GitHub outage), so it must not block the
// month forever.
const STALE_AFTER_MINUTES = 30

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

class ValidationError extends Error {}

function parseStart(payload: Record<string, unknown>) {
  const year = Number(payload.year)
  const month = Number(payload.month)
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    throw new ValidationError('year must be a whole number between 2024 and 2100.')
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError('month must be a whole number between 1 and 12.')
  }
  const excludedRaw = payload.excludedProfileIds ?? []
  if (!Array.isArray(excludedRaw) || excludedRaw.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    throw new ValidationError('excludedProfileIds must be a list of profile ids.')
  }
  return {
    year,
    month,
    useCarryForward: payload.useCarryForward === true,
    excludedProfileIds: [...new Set(excludedRaw as string[])],
  }
}

async function findActiveJob(admin: SupabaseClient, year: number, month: number) {
  const { data, error } = await admin
    .from('roster_generation_jobs')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .in('status', ['queued', 'running'])
    .maybeSingle()
  if (error) throw error
  return data
}

async function failJob(admin: SupabaseClient, jobId: string, message: string, detail: string) {
  const { data, error } = await admin
    .from('roster_generation_jobs')
    .update({ status: 'failed', message, error_detail: detail, finished_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['queued', 'running'])
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

async function dispatchWorkflow(job: { id: string; year: number; month: number }) {
  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN')
  if (!token) {
    return { ok: false, detail: 'GITHUB_DISPATCH_TOKEN is not set on the roster-generation Edge Function.' }
  }
  const repo = Deno.env.get('GITHUB_SCHEDULER_REPO') ?? 'vic-ec/RotaCatScheduler'
  const workflow = Deno.env.get('GITHUB_SCHEDULER_WORKFLOW') ?? 'generate-roster.yml'
  const ref = Deno.env.get('GITHUB_SCHEDULER_REF') ?? 'main'

  let res: Response
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'rotacat-roster-generation',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref,
        inputs: { year: String(job.year), month: String(job.month), job_id: job.id },
      }),
    })
  } catch (err) {
    return { ok: false, detail: `Could not reach GitHub: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (res.status === 204) return { ok: true, detail: '' }
  const body = (await res.text()).slice(0, 1000)
  return { ok: false, detail: `GitHub refused to start the workflow (HTTP ${res.status}) for ${repo}/${workflow}@${ref}: ${body}` }
}

async function handleStart(admin: SupabaseClient, payload: Record<string, unknown>, callerId: string) {
  const input = parseStart(payload)

  // The scheduler refuses to overwrite a published roster. Say so now
  // rather than five minutes into a run.
  const { data: existingMonth, error: monthError } = await admin
    .from('roster_months')
    .select('status')
    .eq('year', input.year)
    .eq('month', input.month)
    .is('deleted_at', null)
    .maybeSingle()
  if (monthError) throw monthError
  if (existingMonth?.status === 'published') {
    return json({
      error: 'This month is already published. Revert it to draft before generating again.',
    }, 409)
  }

  let active = await findActiveJob(admin, input.year, input.month)
  if (active) {
    const ageMinutes = (Date.now() - new Date(active.created_at).getTime()) / 60000
    if (ageMinutes < STALE_AFTER_MINUTES) {
      return json({ ok: true, job: active, alreadyRunning: true })
    }
    await failJob(
      admin,
      active.id,
      'This run stopped responding and was abandoned.',
      `No result after ${Math.round(ageMinutes)} minutes (limit ${STALE_AFTER_MINUTES}). ` +
        `Last status: ${active.status}. GitHub run: ${active.github_run_url ?? 'not started'}.`,
    )
    active = null
  }

  const { data: job, error: insertError } = await admin
    .from('roster_generation_jobs')
    .insert({
      year: input.year,
      month: input.month,
      use_carry_forward: input.useCarryForward,
      excluded_profile_ids: input.excludedProfileIds,
      requested_by: callerId,
      message: 'Waiting for a GitHub runner to start.',
    })
    .select('*')
    .single()
  if (insertError) {
    // Unique index: another admin started the same month a moment ago.
    if (insertError.code === '23505') {
      const raced = await findActiveJob(admin, input.year, input.month)
      if (raced) return json({ ok: true, job: raced, alreadyRunning: true })
    }
    throw insertError
  }

  const dispatched = await dispatchWorkflow(job)
  if (!dispatched.ok) {
    console.error('roster-generation dispatch failed:', dispatched.detail)
    const failed = await failJob(admin, job.id, 'The generation run could not be started.', dispatched.detail)
    return json({ error: 'The generation run could not be started.', detail: dispatched.detail, job: failed ?? job }, 502)
  }

  return json({ ok: true, job, alreadyRunning: false })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is misconfigured: service role credentials are unavailable.' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Caller must be a signed-in admin ────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Not signed in.' }, 401)

  const { data: caller, error: callerError } = await admin.auth.getUser(jwt)
  if (callerError || !caller?.user) return json({ error: 'Not signed in.' }, 401)

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', caller.user.id)
    .single()
  if (callerProfileError || callerProfile?.is_admin !== true) {
    return json({ error: 'Only an admin can generate a roster.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400)
  }

  try {
    if (payload.action === 'start') return await handleStart(admin, payload, caller.user.id)
    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.message }, 400)
    const detail = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('roster-generation failed:', detail)
    return json({ error: 'Something went wrong. No run was started.', detail }, 500)
  }
})
