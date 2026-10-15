-- Penghitung pengunjung ringan (tanpa data pribadi).
-- Satu perangkat dihitung sekali per hari WITA: hash IP bergaram harian dipakai sebagai kunci
-- dan dibuang setelah 2 hari. Bila sync-metrics (Plausible) aktif, angkanya menimpa penghitung ini.
set search_path = public, extensions;

create table if not exists visit_log (
  day date not null,
  ip_hash text not null,
  primary key (day, ip_hash)
);
alter table visit_log enable row level security;
revoke all on table visit_log from anon, authenticated;

create or replace function register_visit() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ip text := private.request_ip_hash();
begin
  if v_ip is null then
    return jsonb_build_object('ok', false);
  end if;
  insert into visit_log (day, ip_hash)
  values ((now() at time zone 'Asia/Makassar')::date, v_ip)
  on conflict do nothing;
  if found then
    update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function register_visit() from public;
grant execute on function register_visit() to anon, authenticated;

-- Snapshot status kini ikut membawa total pengunjung
create or replace function public_status_snapshot() returns jsonb
language sql stable security definer
set search_path = public
as $$
  with spbu as (
    select s.id from stations s
     where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
  ),
  per_fuel as (
    select sf.fuel_type_id::text as k,
           jsonb_build_array(
             count(*) filter (where sfs.status = 'available'),
             count(*) filter (where sfs.status = 'limited'),
             count(*) filter (where sfs.status = 'empty'),
             count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown')) as c
      from station_fuels sf
      join spbu on spbu.id = sf.station_id
      left join station_fuel_status sfs
        on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
     group by sf.fuel_type_id
  ),
  overall as (
    select jsonb_build_array(
             count(*) filter (where ss.overall_status = 'available'),
             count(*) filter (where ss.overall_status = 'limited'),
             count(*) filter (where ss.overall_status = 'empty'),
             count(*) filter (where coalesce(ss.overall_status, 'unknown') = 'unknown')) as c
      from spbu left join station_status ss on ss.station_id = spbu.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', coalesce((select online_now from site_metrics_live where id = 1), 0),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(ss.station_id))
          from station_status ss
          join stations s on s.id = ss.station_id
         where s.is_active and s.moderation_status = 'approved'
           and (ss.overall_status <> 'unknown' or ss.queue_level is not null)
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  )
$$;

-- Retensi: buang catatan kunjungan lama
create or replace function run_retention() returns void
language sql security definer set search_path = public as $$
  update reports set reporter_location = null
   where reporter_location is not null and created_at < now() - interval '30 days';
  delete from queue_pings where at < now() - interval '24 hours';
  delete from queue_messages where created_at < now() - interval '7 days';
  delete from abuse_events where created_at < now() - interval '90 days';
  delete from visit_log where day < (now() at time zone 'Asia/Makassar')::date - 2;
$$;

revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;
revoke execute on function run_retention() from public, anon, authenticated;
