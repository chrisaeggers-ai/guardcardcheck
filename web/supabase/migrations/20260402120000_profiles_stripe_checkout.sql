-- User profiles + Stripe subscription fields (app upserts by auth user id).
-- Safe to run once; use separate ALTERs below if you already had an older profiles table.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  subscription_status text,
  billing_interval text,
  plan_expires_at timestamptz,
  last_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx on public.profiles (stripe_customer_id);

comment on table public.profiles is 'App profile + billing; service role writes from API; users may read own row.';

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);
