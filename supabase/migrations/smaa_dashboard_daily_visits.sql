-- SMAA Matchday dashboard: one row per day with a fetch count.
-- Keeps the free project "active" (database activity) and shows usage. No personal data.
create table if not exists public.smaa_dashboard_visits (
  day date primary key,
  hits integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.smaa_dashboard_visits enable row level security;
-- No policies: public (anon/authenticated) keys can't read or write it.

create or replace function public.smaa_bump_visit()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.smaa_dashboard_visits (day, hits, updated_at)
  values ((now() at time zone 'Australia/Adelaide')::date, 1, now())
  on conflict (day) do update
    set hits = public.smaa_dashboard_visits.hits + 1,
        updated_at = now();
$$;

revoke all on function public.smaa_bump_visit() from public, anon, authenticated;
grant execute on function public.smaa_bump_visit() to service_role;
grant all on table public.smaa_dashboard_visits to service_role;
