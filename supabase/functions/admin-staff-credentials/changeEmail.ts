// The pure decisions behind the `change_email` action and the choice of
// credentials email, kept apart from index.ts so they can be unit-tested
// under the repo's normal `npm test` (index.ts itself needs the Deno
// runtime and a live project). Nothing here touches the network.

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const SUPER_ADMIN_ONLY_MESSAGE = 'Only the super-admin can change a staff email address.'
export const OWN_EMAIL_MESSAGE = 'Change your own email from your Account page.'
export const DUPLICATE_EMAIL_MESSAGE = 'An account with that email address already exists.'

export type ChangeEmailCheck =
  | { ok: true; profileId: string; email: string; sendCredentials: boolean }
  | { ok: false; status: number; error: string }

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Everything that can be refused before reading the target account, in the
// order the refusals matter: permission first, so a caller who may not do
// this learns nothing about what a valid request looks like.
export function checkChangeEmailRequest(
  caller: { id: string; isSuperAdmin: boolean },
  payload: Record<string, unknown>,
): ChangeEmailCheck {
  if (!caller.isSuperAdmin) return { ok: false, status: 403, error: SUPER_ADMIN_ONLY_MESSAGE }

  const profileId = trimmed(payload.profileId)
  if (!profileId) return { ok: false, status: 400, error: 'profileId is required.' }
  if (profileId === caller.id) return { ok: false, status: 400, error: OWN_EMAIL_MESSAGE }

  const email = trimmed(payload.email).toLowerCase()
  if (!EMAIL_PATTERN.test(email)) return { ok: false, status: 400, error: 'Enter a valid email address.' }

  return { ok: true, profileId, email, sendCredentials: payload.sendCredentials === true }
}

// Auth stores addresses lowercased, but compare case-insensitively anyway
// so an older mixed-case row can't slip a no-op change through.
export function isSameEmail(current: string | null | undefined, next: string): boolean {
  return (current ?? '').trim().toLowerCase() === next.trim().toLowerCase()
}

// Supabase Auth's wording for "that address belongs to someone else".
export function isDuplicateEmailError(message: string | null | undefined): boolean {
  return /already|registered|exists/i.test(message ?? '')
}

// Someone who has never signed in has never used the account: for them a
// fresh password is their welcome, not a reset, so they get the "Welcome to
// RotaCat" email. Anyone who has signed in gets "Your new RotaCat password".
export function isResetFor(lastSignInAt: string | null | undefined): boolean {
  return Boolean(lastSignInAt)
}
