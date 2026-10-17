-- Visit counts per club dashboard (SMAA, Metro Jets…). No personal data.
create table if not exists public.club_dashboard_visits (
  day date not null,
  club text not null,
  hits integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, club)
);
alter table public.club_dashboard_visits enable row level security;
-- No policies: public keys can't read or write it.

-- Carry SMAA's history across from the original counter.
insert into public.club_dashboard_visits (day, club, hits, updated_at)
select day, 'smaa', hits, updated_at from public.smaa_dashboard_visits
on conflict (day, club) do nothing;

create or replace function public.club_bump_visit(p_club text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.club_dashboard_visits (day, club, hits, updated_at)
  values ((now() at time zone 'Australia/Adelaide')::date, p_club, 1, now())
  on conflict (day, club) do update
    set hits = public.club_dashboard_visits.hits + 1,
        updated_at = now();
$$;

revoke all on function public.club_bump_visit(text) from public, anon, authenticated;
grant execute on function public.club_bump_visit(text) to service_role;
grant all on table public.club_dashboard_visits to service_role;
