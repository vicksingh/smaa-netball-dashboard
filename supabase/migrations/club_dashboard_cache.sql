-- Last good fixtures bundle per club + season, shared by every copy of the messenger.
-- Public PlayHQ fixture data only. Lets the messenger answer from here (≤60s old)
-- and fall back to it if PlayHQ refuses a request.
create table if not exists public.club_dashboard_cache (
  org text not null,
  season text not null,
  body text not null,
  fetched_at timestamptz not null default now(),
  primary key (org, season)
);
alter table public.club_dashboard_cache enable row level security;
grant all on table public.club_dashboard_cache to service_role;
