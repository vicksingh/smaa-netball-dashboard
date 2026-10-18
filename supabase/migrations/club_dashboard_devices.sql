-- Distinct phones per club per day. device_id is a random ID each phone makes for
-- itself (stored only on that phone); it is not linked to any person or account.
create table if not exists public.club_dashboard_devices (
  day date not null,
  club text not null,
  device_id text not null check (device_id ~ '^[a-z0-9-]{8,40}$'),
  first_seen timestamptz not null default now(),
  primary key (day, club, device_id)
);
alter table public.club_dashboard_devices enable row level security;

create or replace function public.club_record_visit(p_club text, p_device text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d date := (now() at time zone 'Australia/Adelaide')::date;
begin
  insert into public.club_dashboard_visits (day, club, hits, updated_at)
  values (d, p_club, 1, now())
  on conflict (day, club) do update
    set hits = public.club_dashboard_visits.hits + 1, updated_at = now();
  if p_device is not null and p_device ~ '^[a-z0-9-]{8,40}$' then
    insert into public.club_dashboard_devices (day, club, device_id)
    values (d, p_club, p_device)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.club_record_visit(text, text) from public, anon, authenticated;
grant execute on function public.club_record_visit(text, text) to service_role;
grant all on table public.club_dashboard_devices to service_role;
