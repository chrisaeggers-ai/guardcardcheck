-- Allow Nevada PILB lookups in search_history.source

alter table public.search_history drop constraint if exists search_history_source_check;

alter table public.search_history
  add constraint search_history_source_check check (
    source in ('verify', 'name_search', 'florida', 'texas', 'nevada')
  );
