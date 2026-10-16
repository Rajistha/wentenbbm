-- Pelacak antrean: warga di antrean menekan "Saya di antrean ini"; waktunya diukur, lokasinya dipantau secukupnya,
-- dan saat selesai hasilnya (dapat BBM / habis atau tutup) menjadi laporan. Waktu tunggu yang terukur sudah dipakai
-- recompute_station_status() (queue_sessions.end_reason = 'got_fuel').
set search_path = public, extensions;

alter type queue_end_reason add value if not exists 'empty';

alter table queue_sessions add column if not exists last_ping_at timestamptz not null default now();
create index if not exists queue_sessions_open_idx on queue_sessions (station_id) where ended_at is null;

-- Sesi dianggap berjalan bila ada denyut lokasi dalam 20 menit terakhir
create or replace function private.queue_open_window() returns interval
language sql immutable as $$ select interval '20 minutes' $$;

-- Tuple status: [..., laporan 3 jam, jumlah antre sekarang]
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
               and r.created_at > now() - interval '3 hours'),
           (select count(*) from queue_sessions q
             where q.station_id = s.id and q.ended_at is null
               and q.last_ping_at > now() - private.queue_open_window()))
    from stations s
    left join station_status ss on ss.station_id = s.id
   where s.id = p_id
$$;

-- Bagian tambahan snapshot supaya migrasi berikutnya tidak perlu menyalin seluruh fungsi snapshot
create or replace function private.snapshot_extras() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queuing_now', (select count(*) from queue_sessions
                     where ended_at is null and last_ping_at > now() - private.queue_open_window())
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
  ),
  active_ids as (
    select ss.station_id as id from station_status ss
     where ss.overall_status <> 'unknown' or ss.queue_level is not null
    union
    select q.station_id from queue_sessions q
     where q.ended_at is null and q.last_ping_at > now() - private.queue_open_window()
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', (select count(distinct device_key) from visit_devices where last_seen > now() - interval '1 hour'),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'reports_24h', (select count(*) from reports where moderation_status = 'active' and created_at > now() - interval '24 hours'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(s.id))
          from stations s
         where s.id in (select id from active_ids)
           and s.is_active and s.moderation_status = 'approved'
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  ) || private.snapshot_extras()
$$;
revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;

-- ───────────────────────── RPC ─────────────────────────

-- Sesi antrean milik pengguna yang masih berjalan (untuk memulihkan setelah halaman dimuat ulang)
create or replace function queue_my_session() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', q.id, 'station_id', q.station_id, 'fuel_type_id', q.fuel_type_id,
                              'started_at', q.started_at)
      from queue_sessions q
     where q.profile_id = auth.uid() and q.ended_at is null
       and q.last_ping_at > now() - private.queue_open_window()
     limit 1), 'null'::jsonb)
$$;

create or replace function queue_join(
  p_station_id uuid, p_fuel_type_id smallint,
  p_lat double precision, p_lng double precision, p_accuracy_m real
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid     uuid := auth.uid();
  v_profile profiles;
  v_station stations;
  v_dist    real;
  v_id      uuid;
  v_started timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;
  if setting_bool('read_only') then
    return jsonb_build_object('ok', false, 'code', 'READ_ONLY');
  end if;
  v_profile := ensure_profile(v_uid);
  if v_profile.is_blocked then
    return jsonb_build_object('ok', false, 'code', 'BLOCKED');
  end if;
  select * into v_station from stations
   where id = p_station_id and is_active and moderation_status = 'approved' and kind <> 'terminal';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STATION_NOT_FOUND');
  end if;
  if p_accuracy_m is null or p_accuracy_m > setting_num('max_accuracy_m') then
    return jsonb_build_object('ok', false, 'code', 'LOW_ACCURACY');
  end if;
  v_dist := st_distance(v_station.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  if v_dist > setting_num('geofence_m') then
    return jsonb_build_object('ok', false, 'code', 'OUT_OF_RANGE', 'distance_m', round(v_dist));
  end if;
  if (select count(*) from queue_sessions where profile_id = v_uid and started_at > now() - interval '1 day') >= 12 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT_HOURLY');
  end if;
  if p_fuel_type_id is not null and not exists (
       select 1 from station_fuels where station_id = p_station_id and fuel_type_id = p_fuel_type_id) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS');
  end if;

  -- Sesi lama milik pengguna ini ditutup (satu sesi berjalan per pengguna)
  update queue_sessions set ended_at = now(), end_reason = 'timeout'
   where profile_id = v_uid and ended_at is null;

  insert into queue_sessions (station_id, fuel_type_id, profile_id, start_distance_m, last_distance_m)
  values (p_station_id, p_fuel_type_id, v_uid, v_dist, v_dist)
  returning id, started_at into v_id, v_started;
  insert into queue_pings (session_id, distance_m) values (v_id, v_dist);
  update profiles set last_active_at = now() where id = v_uid;
  perform recompute_station_status(p_station_id);
  return jsonb_build_object('ok', true, 'session_id', v_id, 'started_at', v_started);
end;
$$;

-- Denyut lokasi tiap ±60 detik. Bila pengguna menjauh lebih dari 3x radius, sesi berakhir ("left").
create or replace function queue_ping(p_session_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_q    queue_sessions;
  v_dist real;
begin
  select * into v_q from queue_sessions
   where id = p_session_id and profile_id = auth.uid() and ended_at is null;
  if not found then
    return jsonb_build_object('ok', true, 'open', false);
  end if;
  v_dist := st_distance((select location from stations where id = v_q.station_id),
                        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  if v_dist > setting_num('geofence_m') * 3 then
    update queue_sessions set ended_at = now(), end_reason = 'left', last_distance_m = v_dist,
           wait_minutes = least(600, round(extract(epoch from now() - started_at) / 60))::smallint
     where id = v_q.id;
    perform recompute_station_status(v_q.station_id);
    return jsonb_build_object('ok', true, 'open', false);
  end if;
  update queue_sessions set last_ping_at = now(), last_distance_m = v_dist where id = v_q.id;
  insert into queue_pings (session_id, distance_m) values (v_q.id, v_dist) on conflict do nothing;
  return jsonb_build_object('ok', true, 'open', true);
end;
$$;

-- Akhiri sesi. got_fuel dan empty juga dicatat sebagai laporan ketersediaan (lewat submit_report, sehingga
-- semua aturan keamanan yang sama berlaku; bila ditolak, antreannya tetap tercatat).
create or replace function queue_leave(
  p_session_id uuid, p_reason queue_end_reason,
  p_lat double precision default null, p_lng double precision default null, p_accuracy_m real default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_q    queue_sessions;
  v_wait smallint;
  v_lvl  queue_level;
  v_rep  jsonb;
begin
  select * into v_q from queue_sessions
   where id = p_session_id and profile_id = auth.uid() and ended_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_wait := least(600, round(extract(epoch from now() - v_q.started_at) / 60))::smallint;
  update queue_sessions
     set ended_at = now(), end_reason = p_reason, wait_minutes = v_wait,
         last_distance_m = coalesce(
           case when p_lat is not null and p_lng is not null then
             st_distance((select location from stations where id = v_q.station_id),
                         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)::real end,
           last_distance_m)
   where id = v_q.id;

  if p_reason in ('got_fuel', 'empty') and v_q.fuel_type_id is not null
     and p_lat is not null and p_lng is not null and p_accuracy_m is not null then
    v_lvl := case when v_wait <= 5 then 'none' when v_wait <= 15 then 'short'
                  when v_wait <= 30 then 'medium' else 'long' end;
    v_rep := submit_report(
      v_q.station_id, p_lat, p_lng, p_accuracy_m,
      jsonb_build_array(jsonb_build_object('fuel_type_id', v_q.fuel_type_id,
                                           'availability', case p_reason when 'got_fuel' then 'available' else 'empty' end)),
      v_lvl, v_wait, null);
  end if;
  perform recompute_station_status(v_q.station_id);
  return jsonb_build_object('ok', true, 'wait_minutes', v_wait, 'reported', coalesce((v_rep->>'ok')::boolean, false));
end;
$$;

-- Sesi tanpa denyut >20 menit ditutup otomatis (ponsel mati, aplikasi ditutup). Waktunya tidak dihitung.
create or replace function queue_expire() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_station uuid;
  v_n int := 0;
begin
  for v_station in
    update queue_sessions set ended_at = last_ping_at, end_reason = 'timeout'
     where ended_at is null and last_ping_at < now() - private.queue_open_window()
    returning station_id
  loop
    v_n := v_n + 1;
    perform recompute_station_status(v_station);
  end loop;
  return v_n;
end;
$$;

select cron.schedule('queue-expire', '* * * * *', $$select public.queue_expire()$$);
select cron.schedule('queue-retention', '30 19 * * *',
  $$delete from public.queue_sessions where started_at < now() - interval '7 days'$$);

revoke execute on function queue_expire() from public, anon, authenticated;
revoke execute on function queue_my_session() from public, anon;
revoke execute on function queue_join(uuid, smallint, double precision, double precision, real) from public, anon;
revoke execute on function queue_ping(uuid, double precision, double precision) from public, anon;
revoke execute on function queue_leave(uuid, queue_end_reason, double precision, double precision, real) from public, anon;
grant execute on function queue_my_session() to authenticated;
grant execute on function queue_join(uuid, smallint, double precision, double precision, real) to authenticated;
grant execute on function queue_ping(uuid, double precision, double precision) to authenticated;
grant execute on function queue_leave(uuid, queue_end_reason, double precision, double precision, real) to authenticated;
