-- Per-account verification / search audit trail (readable on dashboard).

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  source text not null,
  state_code text,
  primary_label text not null,
  secondary_label text,
  outcome text not null,
  result_summary text,
  from_cache boolean not null default false,
  raw jsonb,
  search_text text generated always as (
    trim(
      coalesce(primary_label, '') || ' ' ||
      coalesce(secondary_label, '') || ' ' ||
      coalesce(result_summary, '')
    )
  ) stored,
  constraint search_history_source_check check (
    source in ('verify', 'name_search', 'florida', 'texas')
  ),
  constraint search_history_outcome_check check (
    outcome in ('success', 'not_found', 'error')
  )
);

create index if not exists search_history_user_created_idx
  on public.search_history (user_id, created_at desc);

comment on table public.search_history is 'Append-only search/verify history; inserts from API (service role).';

alter table public.search_history enable row level security;

create policy "Users can read own search_history"
  on public.search_history for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts from server routes using service role only.
