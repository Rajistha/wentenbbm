-- Jumlah laporan 3 jam per SPBU (elemen ke-9 tuple status), laporan 24 jam se-Bali, dan penanda
-- "ditambahkan warga" (elemen ke-13 tuple tempat). Seluruhnya opsional di klien.
set search_path = public, extensions;

create or replace function station_status_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_array(
           s.id,
           coalesce(ss.overall_status, 'unknown'),
           coalesce(ss.is_confirmed, false),
           ss.queue_level,
           ss.wait_min_low,
           ss.wait_min_high,
           ss.last_report_at,
           coalesce((
             select jsonb_agg(jsonb_build_array(f.fuel_type_id, f.status, f.is_confirmed, f.last_report_at)
                              order by f.fuel_type_id)
               from station_fuel_status f
              where f.station_id = s.id and f.status <> 'unknown'
           ), '[]'::jsonb),
           (select count(*) from reports r
             where r.station_id = s.id and r.moderation_status = 'active'
               and r.created_at > now() - interval '3 hours'))
    from stations s
    left join station_status ss on ss.station_id = s.id
   where s.id = p_id
$$;

create or replace function public_places_snapshot() returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'v', 1,
    'generated_at', now(),
    'fuel_types', (select jsonb_agg(jsonb_build_array(id, code, name, brand, is_filter_tab) order by sort_order)
                     from fuel_types),
    'places', (select coalesce(jsonb_agg(jsonb_build_array(
                        s.id, s.slug, s.kind, s.brand, s.spbu_code, s.name,
                        round(st_y(s.location::geometry)::numeric, 6),
                        round(st_x(s.location::geometry)::numeric, 6),
                        s.region_id, s.is_24h,
                        coalesce((select jsonb_agg(sf.fuel_type_id order by sf.fuel_type_id)
                                    from station_fuels sf where sf.station_id = s.id), '[]'::jsonb),
                        s.address,
                        s.source = 'user') order by s.name), '[]'::jsonb)
                 from stations s
                where s.is_active and s.moderation_status = 'approved')
  )
$$;

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
    'active_4h', (select count(distinct device_key) from visit_devices where last_seen > now() - interval '4 hours'),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'reports_24h', (select count(*) from reports where moderation_status = 'active' and created_at > now() - interval '24 hours'),
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
revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;
