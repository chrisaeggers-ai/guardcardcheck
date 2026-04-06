-- Manual grant: Enterprise (unlimited searches, batch verify, etc.) for Chris's account.
-- Apply via Supabase SQL Editor or `supabase db push` (service role / migration runner).
-- Idempotent: safe to re-run.

insert into public.profiles (id, plan, subscription_status, plan_expires_at, updated_at)
values (
  'c176cbee-03a0-4842-b978-2aa4afe720a8',
  'enterprise',
  'active',
  null,
  now()
)
on conflict (id) do update set
  plan = excluded.plan,
  subscription_status = excluded.subscription_status,
  plan_expires_at = excluded.plan_expires_at,
  updated_at = now();
