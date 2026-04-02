-- Usage tracking for plan limits (free tier daily search cap, analytics for paid).
-- Run in Supabase SQL Editor or: supabase db push

create table if not exists public.usage_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_year text not null,
  monthly_searches integer not null default 0,
  daily_searches integer not null default 0,
  total_searches bigint not null default 0,
  last_search_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_stats_user_month unique (user_id, month_year)
);

create index if not exists usage_stats_user_id_idx on public.usage_stats (user_id);

comment on table public.usage_stats is 'Per-user search counters; free plan uses daily_searches (1/day UTC). Paid plans are unlimited for enforcement but counters still update for dashboard.';

alter table public.usage_stats enable row level security;

create policy "Users can read own usage_stats"
  on public.usage_stats for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts/updates use service role from API routes (bypasses RLS).
