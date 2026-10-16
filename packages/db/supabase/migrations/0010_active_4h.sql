-- Pengguna aktif dalam 4 jam terakhir (angka nyata, bukan perkiraan).
-- Tiap perangkat mengirim "denyut" register_visit() saat situs dibuka dan sekitar tiap 30 menit selama
-- tab terlihat. Denyut hanya memperbarui last_seen; total pengunjung tetap bertambah sekali per hari.
set search_path = public, extensions;

alter table visit_devices add column if not exists last_seen timestamptz not null default now();

create or replace function register_visit(p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ip   text := private.request_ip_hash();
  v_salt text;
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Makassar')::date;
  v_new  boolean;
begin
  -- Tanpa ID perangkat yang valid, jatuh ke hitung per IP seperti sebelumnya
  if p_device is null or length(p_device) < 16 or length(p_device) > 80 then
    if v_ip is null then
      return jsonb_build_object('ok', false);
    end if;
    insert into visit_log (day, ip_hash) values (v_day, v_ip) on conflict do nothing;
    if found then
      update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
    end if;
    return jsonb_build_object('ok', true, 'mode', 'ip');
  end if;

  select salt into v_salt from private.ip_salt where id = 1;
  v_key := encode(extensions.digest(v_salt || p_device, 'sha256'), 'hex');

  insert into visit_devices (day, device_key, ip_hash, last_seen) values (v_day, v_key, v_ip, now())
  on conflict (day, device_key) do update set last_seen = now()
  returning (xmax = 0) into v_new;

  if v_new then
    -- Batas penyalahgunaan: satu IP tidak boleh mendaftarkan terlalu banyak perangkat baru dalam sehari
    if v_ip is not null and (select count(*) from visit_devices where day = v_day and ip_hash = v_ip) > 300 then
      delete from visit_devices where day = v_day and device_key = v_key;
      return jsonb_build_object('ok', false, 'code', 'LIMIT');
    end if;
    update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true, 'mode', 'device');
end;
$$;
revoke execute on function register_visit(text) from public;
grant execute on function register_visit(text) to anon, authenticated;

-- Snapshot status membawa active_4h: perangkat unik yang aktif dalam 4 jam terakhir
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
