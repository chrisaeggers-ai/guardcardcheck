-- Optional phone for legacy rows; new signups require phone in app layer.

alter table public.profiles
  add column if not exists phone text;

create index if not exists profiles_phone_idx on public.profiles (phone)
  where phone is not null;

comment on column public.profiles.phone is 'US E.164 (+1...) collected at signup; nullable for accounts created before phone was required.';
