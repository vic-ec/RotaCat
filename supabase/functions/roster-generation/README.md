# roster-generation

Service-role Edge Function that starts a roster generation run on GitHub
Actions. It replaces the browser calling the Render scheduler directly.

```
POST { action: 'start', year, month, useCarryForward?, excludedProfileIds? }
  → { ok: true, job, alreadyRunning }
```

How a run flows:

1. This function checks the caller is an admin, refuses a published month,
   and inserts a `queued` row in `roster_generation_jobs`.
2. It calls GitHub's workflow-dispatch API for
   `vic-ec/RotaCatScheduler` → `generate-roster.yml`, passing the job id.
3. The runner reads its options from the row, marks it `running`, then
   `succeeded` (with `roster_month_id` and a `summary`) or `failed` (with
   `error_detail`).
4. The app reads the row (admins only, via RLS) to show progress.

Only one job per month can be queued or running. A second `start` returns
the existing job with `alreadyRunning: true`. A job with no result after
30 minutes is marked failed so it cannot block the month.

## Secrets

Set in the Supabase dashboard under Edge Functions → Secrets:

| Name | Required | Value |
|---|---|---|
| `GITHUB_DISPATCH_TOKEN` | yes | Fine-grained GitHub token, repository access limited to `RotaCatScheduler`, permission **Actions: Read and write** only |
| `GITHUB_SCHEDULER_REPO` | no | Defaults to `vic-ec/RotaCatScheduler` |
| `GITHUB_SCHEDULER_WORKFLOW` | no | Defaults to `generate-roster.yml` |
| `GITHUB_SCHEDULER_REF` | no | Defaults to `main` |

The token expires (one year at most). When it does, `start` fails with
"GitHub refused to start the workflow (HTTP 401)" in the job's
`error_detail`; create a new token and replace the secret.

## Deploying

Single file, `verify_jwt` on:

```
supabase functions deploy roster-generation
```
