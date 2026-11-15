-- New enum values for leave cancellation. Kept in their own migration:
-- Postgres will not let a transaction USE an enum value it added, so the
-- function and policies that reference 'cancelled' follow in the next file.
--
-- request_status is shared with account_change_requests; that table never
-- writes 'cancelled' and its readers fall back to a capitalised label.
alter type public.request_status add value if not exists 'cancelled';
alter type public.notification_type add value if not exists 'leave_cancelled';
