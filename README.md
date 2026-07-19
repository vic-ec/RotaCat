# Account Settings — files to copy into RotaCat

New file:
- src/pages/AccountSettingsPage.jsx

Modified files (replace in your repo):
- src/App.jsx              (added /account route)
- src/components/AppLayout.jsx  (added "Account" nav item for all roles)
- src/pages/StaffListPage.jsx   (added "Account requests" admin review tab)

## Supabase migration — ALREADY APPLIED to the live RotaCat project
No action needed. For your records, this was applied directly:
- profiles.avatar_url (text)
- profiles.notification_prefs (jsonb, default all-on)
- New table: account_change_requests (role/category/deletion requests, mirrors leave_requests pattern)
- New storage bucket: avatars (public read, owner-only write via RLS, path convention "<user_id>/avatar.<ext>")

## Note on account deletion
Approving a deletion request deactivates the profile (is_active=false, is_approved=false) —
it does NOT delete the Supabase auth user, since that requires the service role key,
which should never live in the frontend. If you want true deletion, that needs a
Supabase Edge Function (service role) or manual removal in the Supabase dashboard.

## One thing to watch
Admin nav now has 6 items (Dashboard, Roster, Staff, Leave, Account, Settings) in the
mobile bottom nav — might feel cramped on small screens. Worth a look once you're
testing on your phone; happy to move Account into a profile-menu instead if so.
